import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
}

export class GroupPoke extends BaseAction<Payload, null> {
  actionName = ActionName.SendPoke
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]),
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    try {
      if (payload.group_id === undefined) {
        await this.ctx.app.pmhq.sendFriendPoke(+payload.user_id)
      } else {
        await this.ctx.app.pmhq.sendGroupPoke(+payload.group_id, +payload.user_id)
      }
      return null
    }
    catch (e) {
      this.ctx.logger.error('pmhq 发包失败', e)
    }
    return null
  }
}
