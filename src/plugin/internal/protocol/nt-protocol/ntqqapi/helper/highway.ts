import { request } from 'node:http'
import { getLogger } from '@/common/logger'
import { Readable } from 'node:stream'
import { Media } from '../proto'

const logger = getLogger('highway')
import { getMd5BufferFromBuffer } from '@/common/utils'
import { AppInfo } from '../../qqProtocol/direct-lib/appInfo'

interface HighwayTrans {
  uin: string
  cmd: number
  readable: Readable
  sum: Buffer
  size: number
  ticket: Buffer
  ext: Buffer
  server: string[]
}

abstract class AbstractHighwaySession {
  readonly concurrency = 3
  protected nextSeq = 1
  protected retryTimes = 0
  protected availableServer = 0

  constructor(
    protected readonly trans: HighwayTrans
  ) { }

  buildPicUpHead(offset: number, bodyLength: number, bodyMd5: Buffer, retryTimes = 0) {
    logger.debug('buildPicUpHead:', {
      offset, bodyLength,
      ticketLen: this.trans.ticket?.length || 0,
      cmd: this.trans.cmd,
      appId: AppInfo.appId,
    })
    return Media.ReqDataHighwayHead.encode({
      msgBaseHead: {
        version: 1,
        uin: this.trans.uin,
        command: 'PicUp.DataUp',
        seq: this.nextSeq++,
        retryTimes,
        appId: AppInfo.appId,
        dataFlag: 16,
        commandId: this.trans.cmd,
      },
      msgSegHead: {
        serviceId: 0,
        filesize: this.trans.size,
        dataOffset: offset,
        dataLength: bodyLength,
        serviceTicket: this.trans.ticket,
        md5: bodyMd5,
        fileMd5: this.trans.sum,
        cacheAddr: 0,
        cachePort: 0,
      },
      bytesReqExtendInfo: this.trans.ext,
      timestamp: 0,
      msgLoginSigHead: {
        uint32LoginSigType: 8,
        bytesLoginSig: Buffer.alloc(0),
        appId: AppInfo.appId,
      },
    })
  }

  packFrame(head: Buffer, body: Buffer) {
    const totalLength = 9 + head.length + body.length + 1
    const buffer = Buffer.allocUnsafe(totalLength)
    buffer[0] = 0x28
    buffer.writeUInt32BE(head.length, 1)
    buffer.writeUInt32BE(body.length, 5)
    head.copy(buffer, 9)
    body.copy(buffer, 9 + head.length)
    buffer[totalLength - 1] = 0x29
    return buffer
  }

  unpackFrame(frame: Buffer) {
    const headLen = frame.readUInt32BE(1)
    const bodyLen = frame.readUInt32BE(5)
    return [frame.subarray(9, 9 + headLen), frame.subarray(9 + headLen, 9 + headLen + bodyLen)]
  }

  abstract upload(): Promise<void>
}

/** 权限不足等情况下 outer errorCode / segRetCode 都是 0, 真正的原因 (如 "No Perm") 在 bytesRspExtendInfo 的 field 4 */
function extractRspExtErrorMsg(buf: Buffer): string | null {
  let p = 0
  while (p < buf.length) {
    const tag = buf[p++]
    const wire = tag & 7
    const fn = tag >> 3
    if (wire === 0) {
      while (p < buf.length && (buf[p++] & 0x80)) { }
    } else if (wire === 2) {
      let len = 0, sh = 0
      while (p < buf.length) {
        const b = buf[p++]
        len |= (b & 0x7f) << sh
        if (!(b & 0x80)) break
        sh += 7
      }
      const value = buf.subarray(p, p + len)
      p += len
      if (fn === 4) {
        const s = value.toString('utf-8')
        if (s && /^[\x20-\x7e一-鿿]+$/.test(s)) return s
      }
    } else {
      return null
    }
  }
  return null
}

/** wire 级校验: 每个字段的 wire type 合法、长度不越界, 且恰好消费完整个 buffer */
function isValidProtoBuffer(buf: Buffer | undefined | null): boolean {
  if (!buf || buf.length === 0) return false
  const len = buf.length
  let p = 0

  // 大 field number 让 val 溢出也不影响低 3 位的 wireType
  const readTag = (): number => {
    let val = 0
    let shift = 0
    for (; ;) {
      if (p >= len) return -1
      const b = buf[p++]
      val |= (b & 0x7f) << shift
      if (!(b & 0x80)) return val
      shift += 7
      if (shift > 35) return -1  // tag varint 超 5 字节，非法
    }
  }

  const skipVarint = (): boolean => {
    let shift = 0
    for (; ;) {
      if (p >= len) return false
      const b = buf[p++]
      if (!(b & 0x80)) return true
      shift += 7
      if (shift > 63) return false  // value varint 超 10 字节，非法
    }
  }

  // 限制 4 字节: shift >= 28 时 JS 位运算会溢出成小值, 让越界检查误判通过
  const readLength = (): number => {
    let val = 0
    let shift = 0
    for (; ;) {
      if (p >= len) return -1
      const b = buf[p++]
      val |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
      if (shift > 21) return -1  // length varint 超 4 字节，必然远超 buffer 实际长度
    }
    return val
  }

  while (p < len) {
    const tag = readTag()
    if (tag < 0) return false
    const wireType = tag & 7
    if (wireType === 0) {
      if (!skipVarint()) return false
    } else if (wireType === 1) {
      if (p + 8 > len) return false
      p += 8
    } else if (wireType === 2) {
      const fieldLen = readLength()
      if (fieldLen < 0 || p + fieldLen > len) return false
      p += fieldLen
    } else if (wireType === 5) {
      if (p + 4 > len) return false
      p += 4
    } else {
      return false  // wireType 3/4 (group, deprecated) 或 6/7 (非法)
    }
  }
  return p === len
}

export class HighwayHttpSession extends AbstractHighwaySession {
  override async upload() {
    const concurrency = this.concurrency && this.concurrency > 1
      ? this.concurrency
      : 1
    if (concurrency === 1) {
      await this.uploadSerial()
      return
    }
    // 块按 dataOffset 定位, server 按 offset 重组, 不要求顺序。reader 边读边放进有界 queue (背压, 不把整个文件读进
    // 内存), worker 并发上传。最后一块 (isEnd, Connection: close 触发归档) 要等其余块传完再单独发, 不然会提前归档,
    // 所以 reader 总是先暂存刚读到的块, 读到下一块才放行上一块
    const queue: { block: Buffer, offset: number }[] = []
    let pendingLast: { block: Buffer, offset: number } | undefined
    let offset = 0
    let done = false
    const uploadError: Error[] = []
    const queueReady: (() => void)[] = []
    const slotFreed: (() => void)[] = []

    const notifyQueueReady = () => {
      while (queueReady.length > 0) queueReady.shift()!()
    }
    const notifySlotFreed = () => {
      while (slotFreed.length > 0) slotFreed.shift()!()
    }
    const waitQueueReady = () => new Promise<void>((r) => queueReady.push(r))
    const waitSlotFreed = () => new Promise<void>((r) => slotFreed.push(r))

    const reader = (async () => {
      try {
        for await (const chunk of this.trans.readable) {
          const block = chunk as Buffer
          if (pendingLast) {
            if (queue.length >= concurrency) await waitSlotFreed()
            if (uploadError.length) return
            queue.push(pendingLast)
            notifyQueueReady()
          }
          pendingLast = { block, offset }
          offset += block.length
        }
      } finally {
        done = true
        notifyQueueReady()
      }
    })()

    const worker = async () => {
      while (true) {
        if (uploadError.length) return
        let item: { block: Buffer, offset: number } | undefined
        while (!item && (queue.length > 0 || !done)) {
          if (queue.length > 0) {
            item = queue.shift()
            notifySlotFreed()
          } else {
            await waitQueueReady()
          }
        }
        if (!item) return
        try {
          await this.uploadBlockWithRetry(item.block, item.offset, false)
        } catch (err) {
          uploadError.push(err as Error)
          // 唤醒等待中的协程, 让它们看到 uploadError
          notifyQueueReady()
          notifySlotFreed()
          return
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all([reader, ...workers])
    if (uploadError.length) throw uploadError[0]
    if (pendingLast) {
      await this.uploadBlockWithRetry(pendingLast.block, pendingLast.offset, true)
    }
  }

  private async uploadSerial() {
    let offset = 0
    for await (const chunk of this.trans.readable) {
      const block = chunk as Buffer
      const isEnd = offset + block.length >= this.trans.size
      const upload = async () => {
        try {
          await this.uploadBlock(block, offset, undefined, undefined, isEnd)
          this.availableServer = this.retryTimes
          this.retryTimes = 0
        } catch (err) {
          const { message } = err as Error
          if (
            (
              message.includes('request timeout')
              || message.includes('read ECONNRESET')
              || message.includes('not a valid proto')
            )
            && this.retryTimes < this.trans.server.length - 1
          ) {
            this.retryTimes++
            await upload()
          } else {
            throw new Error(`[Highway] httpUpload Error uploading block at offset ${offset}: ${message}`)
          }
        }
      }
      await upload()
      offset += block.length
    }
  }

  /** 每个块有自己的 retryTimes / availableServer, 共用实例字段会让并发块互相干扰 */
  private async uploadBlockWithRetry(block: Buffer, offset: number, isEnd: boolean): Promise<void> {
    let retryTimes = 0
    let availableServer = 0
    const upload = async () => {
      try {
        await this.uploadBlock(block, offset, retryTimes, availableServer, isEnd)
        availableServer = retryTimes
        retryTimes = 0
      } catch (err) {
        const { message } = err as Error
        if (
          (
            message.includes('request timeout')
            || message.includes('read ECONNRESET')
            || message.includes('not a valid proto')
          )
          && retryTimes < this.trans.server.length - 1
        ) {
          retryTimes++
          await upload()
        } else {
          throw new Error(`[Highway] httpUpload Error uploading block at offset ${offset}: ${message}`)
        }
      }
    }
    await upload()
  }

  private async uploadBlock(
    block: Buffer,
    offset: number,
    retryTimes = this.retryTimes,
    availableServer = this.availableServer,
    isEnd: boolean
  ): Promise<void> {
    const chunkMd5 = getMd5BufferFromBuffer(block)
    const payload = this.buildPicUpHead(offset, block.length, chunkMd5, retryTimes)
    const frame = this.packFrame(payload, block)

    logger.debug('HTTP block req:', {
      offset,
      cmd: this.trans.cmd,
      bodyLen: block.length,
      ticketLen: this.trans.ticket?.length || 0,
      extLen: this.trans.ext?.length || 0,
      headHex: payload.toString('hex'),
      extHex: this.trans.ext?.toString('hex') || '',
    })
    const server = availableServer ? this.trans.server[availableServer] : this.trans.server[retryTimes]
    const resp = await this.httpPostHighwayContent(frame,
      `http://${server}/cgi-bin/httpconn?htcmd=0x6FF0087&uin=${this.trans.uin}`,
      isEnd)
    const [head, body] = this.unpackFrame(resp)

    if (!isValidProtoBuffer(head)) {
      logger.debug('HTTP block resp head invalid proto, raw hex:', {
        offset, isEnd, headHex: head.toString('hex'),
      })
      throw new Error(`HTTP Upload response head is not a valid proto`)
    }
    const headData = Media.RespDataHighwayHead.decode(head)
    logger.debug('HTTP block resp:', {
      offset,
      isEnd,
      cmd: this.trans.cmd,
      errorCode: headData.errorCode,
      seg: headData.msgSegHead ? {
        retCode: headData.msgSegHead.retCode,
        dataOffset: headData.msgSegHead.dataOffset,
        dataLength: headData.msgSegHead.dataLength,
      } : null,
      bodyHex: body.toString('hex').slice(0, 200),
    })
    if (headData.errorCode !== 0) {
      throw new Error(`HTTP Upload failed with code ${headData.errorCode}`)
    }
    const segRet = headData.msgSegHead?.retCode
    if (segRet !== undefined && segRet !== 0) {
      throw new Error(`HTTP Upload seg retCode=${segRet}`)
    }
    const ext = headData.bytesRspExtendInfo
    if (ext && ext.length > 0) {
      const reason = extractRspExtErrorMsg(Buffer.from(ext))
      if (reason) throw new Error(`HTTP Upload rejected: ${reason}`)
    }
  }

  private async httpPostHighwayContent(frame: Buffer, serverURL: string, isEnd: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = request(
        serverURL, {
        method: 'POST',
        timeout: 20 * 1000,
        headers: {
          // server 靠 close 知道上传结束, 触发归档
          'Connection': isEnd ? 'close' : 'keep-alive',
          'Accept-Encoding': 'identity',
          'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2)',
          'Content-Length': frame.length.toString(),
        },
      },
        (res) => {
          const data: Buffer[] = []
          res.on('data', (chunk) => {
            data.push(chunk)
          })
          res.on('end', () => {
            resolve(Buffer.concat(data))
          })
        }
      )
      req.on('error', (error: Error) => {
        reject(error)
      })
      req.on('timeout', () => {
        req.destroy(new Error(`Highway request timeout (20s) on ${serverURL}`))
      })
      req.write(frame)
      req.end()
    })
  }
}
