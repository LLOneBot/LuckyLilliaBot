import { selfInfo } from '@/common/globalVars'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id?: number | string
  user_id: number | string
  target_id?: number | string
}

export class SendPoke extends BaseAction<Payload, null> {
  actionName = ActionName.SendPoke
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]),
    user_id: Schema.union([Number, String]).required(),
    target_id: Schema.union([Number, String])
  })

  async _handle(payload: Payload) {
    if (payload.group_id) {
      await this.ctx.qqProtocol.sendGroupPoke(+payload.group_id, +payload.user_id)
    } else {
      const isSelf = payload.target_id ? payload.target_id.toString() === selfInfo.uin : false
      const result = await this.ctx.ntFriendApi.sendFriendNudge(+payload.user_id, isSelf)
      if (result.errorCode !== 0) {
        throw new Error(result.errorMsg)
      }
    }
    return null
  }
}
