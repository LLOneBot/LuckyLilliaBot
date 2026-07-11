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
    const result = await this.ctx.ntFileApi.getFileUrl(payload.file_id, false)
    if (result.retCode !== 0) {
      throw new Error(result.retMsg)
    }
    return { url: result.url }
  }
}
