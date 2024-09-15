import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  folder_id: string
}

export class DelGroupFolder extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DelGroupFolder
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    folder_id: Schema.string().required()
  })

  async _handle(payload: Payload) {
    await this.ctx.ntGroupApi.deleteGroupFileFolder(payload.group_id.toString(), payload.folder_id)
    return null
  }
}
