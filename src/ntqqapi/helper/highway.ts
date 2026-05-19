import { request } from 'node:http'
import { Readable, Transform, TransformCallback } from 'node:stream'
import { Media } from '../proto'
import { getMd5BufferFromBuffer } from '@/common/utils'
import { connect } from 'node:net'
import { AppInfo } from '../../main/qqProtocol/direct/appInfo'

interface HighwayTrans {
  uin: string
  cmd: number
  readable: Readable
  sum: Buffer
  size: number
  ticket: Buffer
  ext: Buffer
  server: string
  port: number
}

abstract class AbstractHighwaySession {
  /** 单调递增的 block seq */
  protected nextSeq = 1

  constructor(
    protected readonly trans: HighwayTrans
  ) { }

  buildPicUpHead(offset: number, bodyLength: number, bodyMd5: Buffer) {
    if (process.env.DEBUG_HIGHWAY) {
      console.log('[highway] buildPicUpHead:', {
        offset, bodyLength,
        ticketLen: this.trans.ticket?.length || 0,
        cmd: this.trans.cmd,
        appId: AppInfo.appId,
      })
    }
    return Media.ReqDataHighwayHead.encode({
      msgBaseHead: {
        version: 1,
        uin: this.trans.uin,
        command: 'PicUp.DataUp',
        seq: 0,
        retryTimes: 0,
        appId: AppInfo.appId,
        dataFlag: 16,
        commandId: this.trans.cmd,
      } as any,
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
      } as any,
      bytesReqExtendInfo: this.trans.ext,
      timestamp: 0,
      msgLoginSigHead: {
        uint32LoginSigType: 8,
        appId: AppInfo.appId,
      } as any,
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

class HighwayTcpUploaderTransform extends Transform {
  offset: number = 0

  constructor(private readonly session: HighwayTcpSession) {
    super()
  }

  override _transform(data: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    const maxBlockSize = 1024 * 1024
    let chunkOffset = 0
    while (chunkOffset < data.length) {
      const chunkSize = Math.min(maxBlockSize, data.length - chunkOffset)
      const chunk = data.subarray(chunkOffset, chunkOffset + chunkSize)
      const chunkMd5 = getMd5BufferFromBuffer(chunk)
      const head = this.session.buildPicUpHead(this.offset, chunk.length, chunkMd5)
      chunkOffset += chunk.length
      this.offset += chunk.length
      this.push(this.session.packFrame(head, chunk))
    }
    callback(null)
  }
}

export class HighwayTcpSession extends AbstractHighwaySession {
  override async upload() {
    await new Promise<void>((resolve, reject) => {
      const totalBlocks = Math.ceil(this.trans.size / (1024 * 1024))
      let acksReceived = 0
      let lastErrorCode = -1
      let buffer = Buffer.alloc(0)  // 累积 socket 收到的字节用于 frame 分帧
      const highwayTransForm = new HighwayTcpUploaderTransform(this)
      const socket = connect(this.trans.port, this.trans.server, () => {
        this.trans.readable.pipe(highwayTransForm).pipe(socket, { end: false })
      })
      const handleRsp = (head: Buffer) => {
        const rsp = Media.RespDataHighwayHead.decode(head)
        lastErrorCode = rsp.errorCode
        if (process.env.DEBUG_HIGHWAY) {
          console.log('[highway] ack:', JSON.stringify({
            errorCode: rsp.errorCode,
            seg: rsp.msgSegHead ? {
              retCode: rsp.msgSegHead.retCode,
              dataOffset: rsp.msgSegHead.dataOffset,
              dataLength: rsp.msgSegHead.dataLength,
              filesize: rsp.msgSegHead.filesize,
            } : null,
          }))
        }
        if (rsp.errorCode !== 0) {
          socket.destroy()
          reject(new Error(`TCP Upload failed (code=${rsp.errorCode})`))
          return
        }
        acksReceived++
        // 收到所有 block 的 ack 才算上传完成。
        // 注意：仅检查最后块的 ack 不够（ack 乱序时可能漏块）；
        // 收齐后给 server 一点时间彻底归档再关连接，避免 server 端尚未处理完最后块就断开
        if (acksReceived >= totalBlocks) {
          setTimeout(() => socket.end(), 200)
        }
      }
      // 流式 frame 解析：buffer 累积，按 0x28...0x29 分帧
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        while (buffer.length >= 9) {
          if (buffer[0] !== 0x28) {
            // 不应发生：协议帧必须 0x28 开头，丢弃直到下一个
            const idx = buffer.indexOf(0x28)
            if (idx < 0) { buffer = Buffer.alloc(0); break }
            buffer = buffer.subarray(idx)
            continue
          }
          const headLen = buffer.readUInt32BE(1)
          const bodyLen = buffer.readUInt32BE(5)
          const total = 9 + headLen + bodyLen + 1
          if (buffer.length < total) break  // 帧不完整，等更多数据
          const head = buffer.subarray(9, 9 + headLen)
          buffer = buffer.subarray(total)
          handleRsp(head)
        }
      })
      socket.on('close', () => {
        if (acksReceived >= totalBlocks) {
          resolve()
        } else {
          reject(new Error(`TCP Upload incomplete: got ${acksReceived}/${totalBlocks} acks (lastErrorCode=${lastErrorCode})`))
        }
      })
      socket.on('error', (err) => {
        socket.destroy()
        reject(new Error(`TCP Upload error at socket: ${err}`))
      })
      this.trans.readable.on('error', (err) => {
        socket.destroy()
        reject(new Error(`TCP Upload error at readable: ${err}`))
      })
    })
  }
}

export class HighwayHttpSession extends AbstractHighwaySession {
  override async upload() {
    let offset = 0
    for await (const chunk of this.trans.readable) {
      const block = chunk as Buffer
      // 最后一块用 Connection: close（让 server 知道 upload 结束 → 归档）
      const isEnd = offset + block.length >= this.trans.size
      try {
        await this.uploadBlock(block, offset, isEnd)
      } catch (err) {
        throw new Error(`[Highway] httpUpload Error uploading block at offset ${offset}: ${err}`)
      }
      offset += block.length
    }
  }

  private async uploadBlock(block: Buffer, offset: number, isEnd: boolean): Promise<void> {
    const chunkMd5 = getMd5BufferFromBuffer(block)
    const payload = this.buildPicUpHead(offset, block.length, chunkMd5)
    const frame = this.packFrame(payload, block)

    const resp = await this.httpPostHighwayContent(frame,
      `http://${this.trans.server}:${this.trans.port}/cgi-bin/httpconn?htcmd=0x6FF0087&uin=${this.trans.uin}`,
      isEnd)
    const [head, body] = this.unpackFrame(resp)

    const headData = Media.RespDataHighwayHead.decode(head)
    if (process.env.DEBUG_HIGHWAY) {
      console.log('[HTTP highway] block resp:', JSON.stringify({
        offset,
        isEnd,
        errorCode: headData.errorCode,
        seg: headData.msgSegHead ? {
          retCode: headData.msgSegHead.retCode,
          dataOffset: headData.msgSegHead.dataOffset,
          dataLength: headData.msgSegHead.dataLength,
        } : null,
        bodyHex: body.toString('hex').slice(0, 200),
      }))
    }
    if (headData.errorCode !== 0) throw new Error(`HTTP Upload failed with code ${headData.errorCode}`)
  }

  private async httpPostHighwayContent(frame: Buffer, serverURL: string, isEnd: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = request(
        serverURL, {
        method: 'POST',
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
      req.write(frame)
      req.end()
    })
  }
}
