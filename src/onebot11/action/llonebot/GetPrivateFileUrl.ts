import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'

export interface Payload {
  file_id: string
  user_id?: string
}

export interface Response {
  url: string
}

export class GetPrivateFileUrl extends BaseAction<Payload, Response> {
  actionName = ActionName.GetPrivateFileUrl
  payloadSchema = Schema.object({
    file_id: Schema.string().required(),
    user_id: Schema.string()
  })

  protected async _handle(payload: Payload) {
    let receiverUid = selfInfo.uid
    if (payload.user_id) {
      receiverUid = await this.ctx.ntUserApi.getUidByUin(payload.user_id)
    }
    const url = await this.ctx.app.pmhq.getPrivateFileUrl(receiverUid, payload.file_id)
    return { url }
  }
}
