import { BaseAction, Schema } from '../BaseAction'
import { GroupMemberRole } from '@/ntqqapi/types'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

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
    enable: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    if (!uid) throw new Error('无法获取用户信息')
    const res = await this.ctx.ntGroupApi.setMemberRole(
      groupCode,
      uid,
      payload.enable ? GroupMemberRole.Admin : GroupMemberRole.Normal
    )
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
