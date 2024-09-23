import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
  duration: number
}

export default class SetGroupBan extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupBan
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    duration: Schema.number().default(30 * 60)
  })

  protected async _handle(payload: Payload): Promise<null> {
    const groupCode = payload.group_id.toString()
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    if (!uid) throw new Error('无法获取用户信息')
    await this.ctx.ntGroupApi.banMember(groupCode, [
      { uid, timeStamp: payload.duration },
    ])
    return null
  }
}
