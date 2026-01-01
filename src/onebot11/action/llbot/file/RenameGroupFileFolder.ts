import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  folder_id: string
  new_folder_name: string
}

export class RenameGroupFileFolder extends BaseAction<Payload, null> {
  actionName = ActionName.RenameGroupFileFolder
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    folder_id: Schema.string().required(),
    new_folder_name: Schema.string().required()
  })

  async _handle(payload: Payload) {
    const groupId = payload.group_id.toString()
    const res = await this.ctx.ntGroupApi.renameGroupFolder(groupId, payload.folder_id, payload.new_folder_name)
    if (res.resultWithGroupItem.result.retCode !== 0) {
      throw new Error(res.resultWithGroupItem.result.clientWording)
    }
    return null
  }
}
