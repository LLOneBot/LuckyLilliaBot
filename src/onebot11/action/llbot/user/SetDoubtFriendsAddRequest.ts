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
    await this.ctx.ntFriendApi.approvalDoubtFriendRequest(payload.flag)
    return null
  }
}
