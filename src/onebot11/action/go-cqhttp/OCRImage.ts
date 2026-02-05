import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { uri2local } from '@/common/utils/file'
import { access, unlink } from 'node:fs/promises'

interface Payload {
  image: string
}

interface TextDetection {
  text: string
  confidence: number
  coordinates: {
    x: number //int32
    y: number
  }[]
}

interface Response {
  texts: TextDetection[]
  language: string
}

export class OCRImage extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_OCRImage
  payloadSchema = Schema.object({
    image: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const { errMsg, isLocal, path, success } = await uri2local(this.ctx, payload.image, true)
    if (!success) {
      throw new Error(errMsg)
    }
    await access(path)

    const data = await this.ctx.ntFileApi.ocrImage(path)
    if (!isLocal) {
      unlink(path).then().catch((e) => { })
    }
    if (data.code !== 0) {
      throw new Error(data.errMsg)
    }

    const texts = data.result.map(item => {
      const ret: TextDetection = {
        text: item.text,
        confidence: 1,
        coordinates: []
      }
      for (let i = 0; i < 4; i++) {
        const pt = item[`pt${i + 1}`]
        ret.coordinates.push({
          x: +pt.x,
          y: +pt.y
        })
      }
      return ret
    })

    return {
      texts,
      language: ''
    }
  }
}
