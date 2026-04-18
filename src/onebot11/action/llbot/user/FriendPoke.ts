import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  user_id: number | string
  target_id?: number | string
}

export class FriendPoke extends BaseAction<Payload, null> {
  actionName = ActionName.FriendPoke
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    target_id: Schema.union([Number, String])
  })

  async _handle(payload: Payload) {
    await this.ctx.pmhq.sendFriendPoke(+payload.user_id, payload.target_id ? +payload.target_id : +payload.user_id)
    return null
  }
}
