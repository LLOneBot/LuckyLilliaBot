import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
  special_title: string
}

export class SetGroupSpecialTitle extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SetGroupSpecialTitle
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    special_title: Schema.string().default('')
  })

  async _handle(payload: Payload) {
    const groupCode = +payload.group_id
    let uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id, groupCode)
    if (!uid) {
      await this.ctx.ntGroupApi.getGroupMembers(groupCode, true).catch(() => {})
      uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id, groupCode)
    }
    if (!uid) throw new Error(`用户信息获取失败`)
    const result = await this.ctx.ntGroupApi.setGroupMemberSpecialTitle(
      groupCode,
      uid,
      payload.special_title
    )
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg || `OIDB 错误 [${result.errorCode}]`)
    }
    return null
  }
}
