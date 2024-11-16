import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  user_id: string,
  category_id: number
}

export class SetFriendCategory extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendCategory

  protected async _handle(payload: Payload): Promise<null> {
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error('无法获取好友信息')
    return this.ctx.ntFriendApi.setBuddyCategory(uid, +payload.category_id)
  }
}
