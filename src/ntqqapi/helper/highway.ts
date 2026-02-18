import { request } from 'node:http'
import { Readable, Transform, TransformCallback } from 'node:stream'
import { Media } from '../proto'
import { getMd5BufferFromBuffer } from '@/common/utils'
import { connect } from 'node:net'

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
  constructor(
    protected readonly trans: HighwayTrans
  ) { }

  buildPicUpHead(offset: number, bodyLength: number, bodyMd5: Buffer) {
    return Media.ReqDataHighwayHead.encode({
      msgBaseHead: {
        version: 1,
        uin: this.trans.uin,
        command: 'PicUp.DataUp',
        seq: 0,
        retryTimes: 0,
        appId: 1600001604,
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
        appId: 1600001604,
      }
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
      const highwayTransForm = new HighwayTcpUploaderTransform(this)
      const socket = connect(this.trans.port, this.trans.server, () => {
        this.trans.readable.pipe(highwayTransForm).pipe(socket, { end: false })
      })
      const handleRspHeader = (header: Buffer) => {
        const rsp = Media.RespDataHighwayHead.decode(header)
        if (rsp.errorCode !== 0) {
          socket.end()
          reject(new Error(`TCP Upload failed (code=${rsp.errorCode})`))
        }
        if (rsp.msgSegHead!.dataOffset + rsp.msgSegHead!.dataLength >= rsp.msgSegHead!.filesize) {
          socket.end()
          resolve()
        }
      }
      socket.on('data', (chunk: Buffer) => {
        const [head,] = this.unpackFrame(chunk)
        handleRspHeader(head)
      })
      socket.on('close', () => {
        resolve()
      })
      socket.on('error', (err) => {
        socket.end()
        reject(new Error(`TCP Upload error at socket: ${err}`))
      })
      this.trans.readable.on('error', (err) => {
        socket.end()
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
      try {
        await this.uploadBlock(block, offset)
      } catch (err) {
        throw new Error(`[Highway] httpUpload Error uploading block at offset ${offset}: ${err}`)
      }
      offset += block.length
    }
  }

  private async uploadBlock(block: Buffer, offset: number): Promise<void> {
    const chunkMd5 = getMd5BufferFromBuffer(block)
    const payload = this.buildPicUpHead(offset, block.length, chunkMd5)
    const frame = this.packFrame(payload, block)

    const resp = await this.httpPostHighwayContent(frame,
      `http://${this.trans.server}:${this.trans.port}/cgi-bin/httpconn?htcmd=0x6FF0087&uin=${this.trans.uin}`)
    const [head,] = this.unpackFrame(resp)

    const headData = Media.RespDataHighwayHead.decode(head)
    if (headData.errorCode !== 0) throw new Error(`HTTP Upload failed with code ${headData.errorCode}`)
  }

  private async httpPostHighwayContent(frame: Buffer, serverURL: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = request(
        serverURL, {
        method: 'POST',
        headers: {
          'Connection': 'keep-alive',
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
    })
  }
}
