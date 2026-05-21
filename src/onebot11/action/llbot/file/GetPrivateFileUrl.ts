import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { selfInfo } from '@/common/globalVars'

export interface Payload {
  file_id: string
  user_id?: number | string
}

export interface Response {
  url: string
}

export class GetPrivateFileUrl extends BaseAction<Payload, Response> {
  actionName = ActionName.GetPrivateFileUrl
  payloadSchema = Schema.object({
    file_id: Schema.string().required(),
    user_id: Schema.union([Number, String]),
  })

  protected async _handle(payload: Payload) {
    let receiverUid = selfInfo.uid
    if (payload.user_id) {
      receiverUid = await this.ctx.ntUserApi.getUidByUin(String(payload.user_id))
    }
    const { state, url } = await this.ctx.qqProtocol.getPrivateFileUrl(receiverUid, payload.file_id)
    if (state !== 'ok') {
      throw new Error(state)
    }
    return { url }
  }
}

