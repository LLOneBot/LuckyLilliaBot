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
    const result = await this.ctx.ntGroupApi.renameGroupFolder(
      +payload.group_id,
      payload.folder_id,
      payload.new_folder_name
    )
    if (result.retCode !== 0) {
      throw new Error(result.clientWording)
    }
    return null
  }
}
