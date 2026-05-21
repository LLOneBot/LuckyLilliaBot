import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

export interface Payload {
  file_id: string
}

export interface Response {
  url: string
}

export class GetPrivateFileUrl extends BaseAction<Payload, Response> {
  actionName = ActionName.GetPrivateFileUrl
  payloadSchema = Schema.object({
    file_id: Schema.string().required(),
  })

  protected async _handle(payload: Payload) {
    const { state, url } = await this.ctx.qqProtocol.getPrivateFileUrl(payload.file_id)
    if (state !== 'ok') {
      throw new Error(state || '获取私聊文件 URL 失败')
    }
    return { url }
  }
}