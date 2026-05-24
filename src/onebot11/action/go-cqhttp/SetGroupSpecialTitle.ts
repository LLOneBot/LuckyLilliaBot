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
    if (!uid) throw new Error(`用户信息获取失败`)
    await this.ctx.qqProtocol.setSpecialTitle(+payload.group_id, uid, payload.special_title)
    return null
  }
}
