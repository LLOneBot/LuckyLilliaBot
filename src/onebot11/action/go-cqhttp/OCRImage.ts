import { noop } from 'cosmokit'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { getImageSize, uri2local } from '@/common/utils/file'
import { unlink } from 'node:fs/promises'
import { isHttpUrl } from '@/common/utils'
import { selfInfo } from '@/common/globalVars'
import { Media } from '@/ntqqapi/proto'
import { ChatType } from '@/ntqqapi/types'

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
    let url: string
    if (isHttpUrl(payload.image)) {
      url = payload.image
    } else {
      // 先尝试用 fileName 在缓存中找已知图片（接收端调用 ocr_image 时常用 file 字段）
      const cached = await this.ctx.store.getFileCacheByName(payload.image)
      if (cached?.[0]?.originImageUrl) {
        // QQ 图片 URL 含 rkey 会过期，每次取的时候重算
        url = await this.ctx.ntFileApi.getImageUrl(cached[0].originImageUrl, cached[0].md5HexStr)
      } else {
        const { errMsg, isLocal, path, success } = await uri2local(this.ctx, payload.image)
        if (!success) {
          throw new Error(errMsg)
        }
        const size = await getImageSize(path)
        const result = await this.ctx.ntFileApi.uploadPrivateImage(ChatType.C2C, selfInfo.uid, path, size.width, size.height, '', 0)
        if (!isLocal) {
          unlink(path).catch(noop)
        }
        // result.msgInfo 在直连模式下是 raw bytes（commonElem 透传），需要 decode
        const msgInfoBytes = (result.msgInfo instanceof Uint8Array || Buffer.isBuffer(result.msgInfo))
          ? Buffer.from(result.msgInfo as Uint8Array)
          : null
        if (!msgInfoBytes) throw new Error('uploadC2CImage 返回的 msgInfo 不是 bytes')
        const decoded = Media.MsgInfo.decode(msgInfoBytes)
        const head = decoded.msgInfoBody?.[0]
        if (!head?.pic || !head.index) throw new Error('上传图片返回无效')
        url = await this.ctx.ntFileApi.getImageUrl(head.pic.urlPath + head.pic.ext.originalParam, head.index.info.md5HexStr)
      }
    }

    const result = await this.ctx.ntFileApi.ocrImage(url)
    if (result.retCode) {
      throw new Error(result.wording)
    }

    return {
      texts: result.ocrRspBody.textDetections.map(item => ({
        text: item.detectedText,
        confidence: item.confidence,
        coordinates: item.polygon?.coordinates ?? []
      })),
      language: result.ocrRspBody.language
    }
  }
}
