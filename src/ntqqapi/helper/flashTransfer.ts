import { closeSync, openSync, read } from 'node:fs'
import { createHash } from 'node:crypto'
import { Media } from '../proto'
import { InferProtoModelInput } from '@saltify/typeproto'
import { stat } from 'node:fs/promises'
import { getSha1BufferFromFile, Sha1Stream } from '@/common/utils'


export class FlashTransferContext {
  private readonly url = 'https://multimedia.qfile.qq.com/sliceupload'
  private readonly chunkSize = 1024 * 1024 // 1MB

  constructor() { }

  async uploadFile(uKey: string, appId: number, filePath: string) {
    const sha1State: InferProtoModelInput<typeof Media.FlashTransferSha1StateV> = {
      state: []
    }

    const fileLength = (await stat(filePath)).size

    const chunkCount = Math.floor((fileLength + this.chunkSize - 1) / this.chunkSize)

    const sha1Stream = new Sha1Stream()

    for (let i = 0; i < chunkCount; i++) {
      if (i !== chunkCount - 1) {
        const accLength = (i + 1) * this.chunkSize
        const accBuffer = await this.readRange(filePath, 0, accLength)

        sha1Stream.update(accBuffer)
        const digest = sha1Stream.hash(false)
        sha1Stream.reset()
        sha1State.state!.push(Buffer.from(digest))
      } else {
        const digest = await getSha1BufferFromFile(filePath)
        sha1State.state!.push(digest)
      }
    }

    for (let i = 0; i < chunkCount; i++) {
      const chunkStart = i * this.chunkSize
      const chunkLength = Math.min(this.chunkSize, fileLength - chunkStart)

      const uploadBuffer = await this.readRange(filePath, chunkStart, chunkLength)

      const success = await this.uploadChunk(
        uKey,
        appId,
        chunkStart,
        sha1State,
        uploadBuffer
      )
      if (!success) return false
    }

    return true
  }

  private async uploadChunk(
    uKey: string,
    appId: number,
    start: number,
    sha1State: InferProtoModelInput<typeof Media.FlashTransferSha1StateV>,
    body: Buffer
  ) {
    const payload = Media.FlashTransferUploadReq.encode({
      fieId1: 0,
      appId,
      fileId3: 2,
      body: {
        fieId1: Buffer.alloc(0),
        uKey,
        start,
        end: start + body.length - 1,
        sha1: createHash('sha1').update(body).digest(),
        sha1StateV: sha1State,
        body
      }
    })

    const resp = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'gzip'
      },
      body: Uint8Array.from(payload)
    })

    const respBuf = Buffer.from(await resp.arrayBuffer())
    const parsed = Media.FlashTransferUploadResp.decode(respBuf)

    if (parsed.status !== 'success') {
      return false
    }

    return true
  }

  private readRange(filePath: string, start: number, length: number) {
    return new Promise<Buffer>((resolve, reject) => {
      const buffer = Buffer.alloc(length)
      const fd = openSync(filePath, 'r')
      read(fd, buffer, 0, length, start, (err) => {
        closeSync(fd)
        if (err) reject(err)
        else resolve(buffer)
      })
    })
  }
}
