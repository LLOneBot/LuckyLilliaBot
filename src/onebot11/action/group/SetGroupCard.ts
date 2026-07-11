import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
  card: string
}

export default class SetGroupCard extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupCard
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    card: Schema.string().default('')
  })

  protected async _handle(payload: Payload) {
    const uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id, +payload.group_id)
    if (!uid) throw new Error('无法获取用户信息')
    const res = await this.ctx.ntGroupApi.setGroupMemberCard(+payload.group_id, uid, payload.card)
    if (res.errorCode !== 0) {
      throw new Error(res.errorMsg)
    }
    return null
  }
}
