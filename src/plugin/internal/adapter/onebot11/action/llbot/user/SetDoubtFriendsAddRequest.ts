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
    const result = await this.ctx.ntFriendApi.approvalDoubtFriendRequest(payload.flag)
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg)
    }
    return null
  }
}
