import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  user_id: number | string
  remark: string
}

export class SetFriendRemark extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendRemark
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    remark: Schema.string().default('')
  })

  protected async _handle(payload: Payload) {
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error('无法获取好友信息')
    const res = await this.ctx.ntFriendApi.setBuddyRemark(uid, payload.remark)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
