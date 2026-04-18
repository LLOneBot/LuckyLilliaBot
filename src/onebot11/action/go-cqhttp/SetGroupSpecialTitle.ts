import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'
import { GroupMemberRole } from '@/ntqqapi/types'

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
    const groupCode = payload.group_id.toString()
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    if (!uid) throw new Error(`用户${uin}的uid获取失败`)
    const self = await this.ctx.ntGroupApi.getGroupMember(groupCode, selfInfo.uid, false)
    if (self.role !== GroupMemberRole.Owner) {
      throw new Error(`不是群${groupCode}的群主，无法设置群头衔`)
    }
    await this.ctx.pmhq.setSpecialTitle(+payload.group_id, uid, payload.special_title)
    return null
  }
}
