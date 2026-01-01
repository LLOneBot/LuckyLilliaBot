import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  file_id: string
  parent_directory: string
  target_directory: string
}

export class MoveGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.MoveGroupFile
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required(),
    parent_directory: Schema.string().required(),
    target_directory: Schema.string().required()
  })

  async _handle(payload: Payload) {
    const groupId = payload.group_id.toString()
    const res = await this.ctx.ntGroupApi.moveGroupFile(groupId, [payload.file_id], payload.parent_directory, payload.target_directory)
    if (res.moveGroupFileResult.result.retCode !== 0) {
      throw new Error(res.moveGroupFileResult.result.clientWording)
    }
    return null
  }
}
