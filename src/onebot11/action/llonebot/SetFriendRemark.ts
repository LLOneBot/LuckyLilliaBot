import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  user_id: string,
  remark?: string
}

export class SetFriendRemark extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendRemark

  protected async _handle(payload: Payload): Promise<null> {
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error('无法获取好友信息')
    return this.ctx.ntFriendApi.setBuddyRemark(uid, payload.remark || '')
  }
}
