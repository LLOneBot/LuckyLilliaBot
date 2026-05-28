import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  folder_id: string
}

export class DeleteGroupFolder extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DeleteGroupFolder
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    folder_id: Schema.string().required()
  })

  async _handle(payload: Payload) {
    const result = await this.ctx.ntGroupApi.deleteGroupFolder(+payload.group_id, payload.folder_id)
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg)
    }
    return null
  }
}
