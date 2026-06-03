import { selfInfo } from '@/common/globalVars'
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
    const isSelf = payload.target_id ? payload.target_id.toString() === selfInfo.uin : false
    const result = await this.ctx.ntFriendApi.sendFriendNudge(+payload.user_id, isSelf)
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg)
    }
    return null
  }
}
