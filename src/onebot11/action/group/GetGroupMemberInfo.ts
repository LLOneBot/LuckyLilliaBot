import { BaseAction, Schema } from '../BaseAction'
import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { isNullable } from 'cosmokit'

interface Payload {
  group_id: number | string
  user_id: number | string
}

class GetGroupMemberInfo extends BaseAction<Payload, OB11GroupMember> {
  actionName = ActionName.GetGroupMemberInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error('无法获取用户信息')
    const member = await this.ctx.ntGroupApi.getGroupMember(groupCode, uid)
    if (member) {
      if (isNullable(member.sex)) {
        const info = await this.ctx.ntUserApi.getUserDetailInfo(member.uid)
        Object.assign(member, info)
      }
      const ret = OB11Entities.groupMember(groupCode, member)
      const date = Math.round(Date.now() / 1000)
      ret.last_sent_time ??= date
      ret.join_time ??= date
      return ret
    }
    throw new Error(`群成员${payload.user_id}不存在`)
  }
}

export default GetGroupMemberInfo
