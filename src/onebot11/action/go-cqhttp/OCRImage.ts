import { noop } from 'cosmokit'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { uri2local } from '@/common/utils/file'
import { unlink } from 'node:fs/promises'
import { isHttpUrl } from '@/common/utils'
import { selfInfo } from '@/common/globalVars'

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
    let url
    if (isHttpUrl(payload.image)) {
      url = payload.image
    } else {
      const { errMsg, isLocal, path, success } = await uri2local(this.ctx, payload.image)
      if (!success) {
        throw new Error(errMsg)
      }
      const { msgInfo } = await this.ctx.ntFileApi.uploadC2CImage(selfInfo.uid, path)
      if (!isLocal) {
        unlink(path).catch(noop)
      }
      const { pic, index } = msgInfo.msgInfoBody[0]
      url = await this.ctx.ntFileApi.getImageUrl(pic!.urlPath + pic!.ext.originalParam, index.info.md5HexStr)
    }

    const { textDetections, language } = await this.ctx.ntFileApi.ocrImage(url)

    return {
      texts: textDetections.map(item => ({
        text: item.detectedText,
        confidence: item.confidence,
        coordinates: item.polygon.coordinates
      })),
      language
    }
  }
}
