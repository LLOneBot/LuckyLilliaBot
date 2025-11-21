import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  user_id: number | string
  category_id: number | string
}

export class SetFriendCategory extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendCategory
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    category_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error('无法获取好友信息')
    const res = await this.ctx.ntFriendApi.setBuddyCategory(uid, +payload.category_id)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
