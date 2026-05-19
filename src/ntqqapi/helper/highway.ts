import { request } from 'node:http'
import { Readable } from 'node:stream'
import { Media } from '../proto'
import { getMd5BufferFromBuffer } from '@/common/utils'
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
        seq: this.nextSeq++,
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
