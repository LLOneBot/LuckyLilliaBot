import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  user_id: number | string
}

export class FriendPoke extends BaseAction<Payload, null> {
  actionName = ActionName.FriendPoke
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    try {
      await this.ctx.app.pmhq.sendFriendPoke(+payload.user_id)
      return null
    }catch (e) {
      this.ctx.logger.error('pmhq 发包失败', e)
    }
    return null
  }
}
