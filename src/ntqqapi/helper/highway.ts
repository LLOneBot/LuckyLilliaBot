import { request } from 'node:http'
import { getLogger } from '@/common/logger'
import { Readable } from 'node:stream'
import { Media } from '../proto'

const logger = getLogger('highway')
import { getMd5BufferFromBuffer } from '@/common/utils'
import { AppInfo } from '../../main/qqProtocol/direct-lib/appInfo'

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
  readonly concurrency = 4
  /** 单调递增的 block seq */
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

/**
 * 挖 bytesRspExtendInfo 里的错误字符串。highway 服务器在权限不足等场景下，
 * outer errorCode/segRetCode 都是 0，但会把真正的拒绝原因（如 "No Perm"）
 * 塞在 bytesRspExtendInfo 嵌套 protobuf 的 field 4 里。
 */
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

/**
 * 校验 buffer 是否是结构合法的 protobuf 编码（wire-level 校验）。
 *
 * 校验规则（protobuf wire format）：
 *   - tag varint 低 3 位 = wire type，必须 ∈ {0,1,2,5}（3/4=group 已废弃，6/7 非法）
 *   - wire 0 (varint)          ：value varint 完整不越界（≤10 字节，protobuf 上限）
 *   - wire 1 (fixed64)         ：剩余 ≥ 8 字节
 *   - wire 2 (length-delimited)：length varint 合法且 offset+length ≤ buf.length
 *   - wire 5 (fixed32)         ：剩余 ≥ 4 字节
 *   - 整个 buffer 被完整消费，结束时 offset 恰好 = buf.length
 * 返回 true 表示可安全交给 decode。
 */
function isValidProtoBuffer(buf: Buffer | undefined | null): boolean {
  if (!buf || buf.length === 0) return false
  const len = buf.length
  let p = 0

  // 读 tag varint（field number 最大 2^29-1，tag 最多 5 字节）。
  // 返回 tag 值；越界/超长返回 -1。即使大 field number 让 val 在 JS 位运算里溢出，
  // wireType = val & 7 仍取低 3 位合法，不影响 wire 校验。
  const readTag = (): number => {
    let val = 0
    let shift = 0
    for (;;) {
      if (p >= len) return -1
      const b = buf[p++]
      val |= (b & 0x7f) << shift
      if (!(b & 0x80)) return val
      shift += 7
      if (shift > 35) return -1  // tag varint 超 5 字节，非法
    }
  }

  // 跳过 wire 0 的 value varint（uint64 最多 10 字节）。越界/超长返回 false。
  const skipVarint = (): boolean => {
    let shift = 0
    for (;;) {
      if (p >= len) return false
      const b = buf[p++]
      if (!(b & 0x80)) return true
      shift += 7
      if (shift > 63) return false  // value varint 超 10 字节，非法
    }
  }

  // 读 wire 2 的 length varint，返回字段内容长度；越界/巨大返回 -1。
  // length 是 uint32，限制 4 字节（最大 2^28-1 ≈ 268MB），既覆盖所有合理 head 大小，
  // 又避免 JS 32 位位运算在 shift≥28 时溢出回绕成小值导致 `p + fieldLen <= len` 误判通过。
  const readLength = (): number => {
    let val = 0
    let shift = 0
    for (;;) {
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
      // 串行路径：保留原字节级行为 (实例 retryTimes/availableServer sticky 语义)，
      // 老调用点 (不传 concurrency 或传 1) 完全等价。
      await this.uploadSerial()
      return
    }
    // 并发路径：所有块通过 dataOffset 自定位 (互相独立)，server 按 offset 累积重组，
    // 不要求顺序到达。手写 producer-consumer pipeline：
    //   - reader 协程持续 for-await 读流，不等上传完成 → 磁盘 IO 与网络真正重叠
    //   - N 个 worker 协程从有界 queue 拉任务上传 → 背压把内存峰值卡在 concurrency × block
    // 不用 mapWithConcurrency 的原因：它要求数组入参，必须先全读完流才并发派发，
    // 既失去流水线收益又把整个文件 buffer 进内存 (群文件 100MB+ 危险)。
    // queue 容量 = concurrency 才能让 reader 在 workers 跟不上时自然 pause (背压)。
    // 最后一块单独串行上传 (传 isEnd=true 触发归档)：
    //   - 并发乱序下若把最后块当普通任务丢 queue，worker 可能在其他块还没落到 server
    //     时就发掉它，server 收到 Connection: close 时文件还不完整 → 提前归档/拒绝。
    //   - 因此 reader 把"可能是最后一块"暂存 pendingLast 而不入 queue；下一轮读到新块
    //     时说明上一块不是最后，才放行上一块进 queue。流结束时 pendingLast 才是真正的最后块，
    //     此时所有并发 worker 已处理完前面的块，再单独串行上传它 (isEnd=true)。
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

    // reader
    const reader = (async () => {
      try {
        for await (const chunk of this.trans.readable) {
          const block = chunk as Buffer
          // 当前读到的块暂存为"可能是最后一块"，把上一轮的 pendingLast 放行进并发 queue。
          // 直到读到下一个块或流结束，才能确定谁才是真正的最后块。
          if (pendingLast) {
            // 背压：queue 满时暂停读取，等 worker 取走
            if (queue.length >= concurrency) await waitSlotFreed()
            if (uploadError.length) return  // 已有上传失败，提前停读
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

    // worker：只处理并发 queue 里的块（全是 isEnd=false，non-end）。
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
          // 唤醒所有可能卡在 waitQueueReady / waitSlotFreed 的协程，让它们检查 uploadError
          notifyQueueReady()
          notifySlotFreed()
          return
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all([reader, ...workers])
    if (uploadError.length) throw uploadError[0]
    // 所有并发块全部成功后，单独串行上传真正的最后一块 (isEnd=true → Connection: close → 归档)。
    // 此时 server 已收到完整文件的其余部分，最后一块补齐后再 close 不会触发提前归档。
    if (pendingLast) {
      await this.uploadBlockWithRetry(pendingLast.block, pendingLast.offset, true)
    }
  }

  /** 串行实现：原 upload() 内容原样保留。 */
  private async uploadSerial() {
    let offset = 0
    for await (const chunk of this.trans.readable) {
      const block = chunk as Buffer
      // 最后一块用 Connection: close（让 server 知道 upload 结束 → 归档）
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

  /**
   * 并发路径里单个块的重试逻辑。每个块独立维护自己的 retryTimes + availableServer
   * (不能复用实例字段，否则并发块互串)。
   */
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
    if (headData.errorCode !== 0) throw new Error(`HTTP Upload failed with code ${headData.errorCode}`)
    const segRet = headData.msgSegHead?.retCode
    if (segRet !== undefined && segRet !== 0) {
      throw new Error(`HTTP Upload seg retCode=${segRet}`)
    }
    // 服务器有时把真正的拒绝原因放在 bytesRspExtendInfo.field4（字符串），outer errorCode 仍是 0。
    // 例：群头像无权限时返回 "No Perm"。挖出来当 error 抛，免得用户以为成功。
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
        timeout: 10 * 1000,
        headers: {
          // 最后一块 close，其他 keep-alive。server 用这个信号知道整体上传结束 → 触发归档
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
        req.destroy(new Error(`Highway request timeout (10s) on ${serverURL}`))
      })
      req.write(frame)
      req.end()
    })
  }
}
