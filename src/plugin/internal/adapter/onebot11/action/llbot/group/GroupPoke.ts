import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  user_id: number | string
}

export class GroupPoke extends BaseAction<Payload, null> {
  actionName = ActionName.GroupPoke
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    const result = await this.ctx.ntGroupApi.sendGroupNudge(+payload.group_id, +payload.user_id)
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg)
    }
    return null
  }
}
