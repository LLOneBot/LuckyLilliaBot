import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  file_id: string
}

export class SetGroupFileForever extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupFileForever
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required(),
  })

  async _handle(payload: Payload) {
    const groupId = payload.group_id.toString()
    const res = await this.ctx.ntGroupApi.setGroupFileForever(groupId, payload.file_id)
    if (res.transGroupFileResult.result.retCode !== 0) {
      throw new Error(res.transGroupFileResult.result.clientWording)
    }
    return null
  }
}
