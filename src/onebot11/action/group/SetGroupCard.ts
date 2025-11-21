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
    const groupCode = payload.group_id.toString()
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    if (!uid) throw new Error('无法获取用户信息')
    await this.ctx.ntGroupApi.setMemberCard(groupCode, uid, payload.card)
    return null
  }
}
