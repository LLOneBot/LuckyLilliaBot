import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

export interface Payload {
  group_id: number | string
  file_id: string
  busid?: number
}

export interface Response {
  url: string
}

export class GetGroupFileUrl extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupFileUrl
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const result = await this.ctx.ntFileApi.getFileUrl(
      payload.file_id,
      true,
      +payload.group_id
    )
    if (result.retCode !== 0) {
      throw new Error(result.retMsg)
    }
    const file = await this.ctx.store.getFileCacheById(payload.file_id)
    if (file.length > 0) {
      return { url: result.url + encodeURIComponent(file[0].fileName) }
    } else {
      return { url: result.url }
    }
  }
}
