import { BaseAction, Schema } from '../BaseAction'
import { GroupMemberRole } from '@/ntqqapi/types'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
  enable: boolean
}

export default class SetGroupAdmin extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupAdmin
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    enable: Schema.boolean().default(true)
  })

  protected async _handle(payload: Payload): Promise<null> {
    const groupCode = payload.group_id.toString()
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    if (!uid) throw new Error('无法获取用户信息')
    await this.ctx.ntGroupApi.setMemberRole(
      groupCode,
      uid,
      payload.enable ? GroupMemberRole.admin : GroupMemberRole.normal
    )
    return null
  }
}
