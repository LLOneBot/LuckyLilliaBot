import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
  reject_add_request: boolean
}

export default class SetGroupKick extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupKick
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    reject_add_request: Schema.boolean().default(false)
  })

  protected async _handle(payload: Payload): Promise<null> {
    const groupCode = payload.group_id.toString()
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    if (!uid) throw new Error('无法获取用户信息')
    await this.ctx.ntGroupApi.kickMember(groupCode, [uid], payload.reject_add_request)
    return null
  }
}
