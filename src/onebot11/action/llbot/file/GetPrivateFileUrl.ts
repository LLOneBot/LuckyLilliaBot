import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { selfInfo } from '@/common/globalVars'

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
    const url = await this.ctx.app.pmhq.getPrivateFileUrl(selfInfo.uid, payload.file_id)
    return { url }
  }
}
