import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  flag: string
}

export class SetDoubtFriendsAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetDoubtFriendsAddRequest
  payloadSchema = Schema.object({
    flag: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntFriendApi.approvalDoubtBuddyReq(payload.flag)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
