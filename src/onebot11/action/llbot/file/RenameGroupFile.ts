import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  file_id: string
  current_parent_directory: string
  new_name: string
}

export class RenameGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.RenameGroupFile
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required(),
    current_parent_directory: Schema.string().required(),
    new_name: Schema.string().required()
  })

  async _handle(payload: Payload) {
    const groupId = payload.group_id.toString()
    const res = await this.ctx.ntGroupApi.renameGroupFile(groupId, payload.file_id, payload.current_parent_directory, payload.new_name)
    if (res.renameGroupFileResult.result.retCode !== 0) {
      throw new Error(res.renameGroupFileResult.result.clientWording)
    }
    return null
  }
}
