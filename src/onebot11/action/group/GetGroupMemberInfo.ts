import { BaseAction, Schema } from '../BaseAction'
import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { calcQQLevel, parseBool } from '@/common/utils/misc'
import { SimpleInfo } from '@/ntqqapi/types'

interface Payload {
  group_id: number | string
  user_id: number | string
  no_cache: boolean
}

class GetGroupMemberInfo extends BaseAction<Payload, OB11GroupMember> {
  actionName = ActionName.GetGroupMemberInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString(), groupCode)
    if (!uid) throw new Error('无法获取用户信息')
    const member = await this.ctx.ntGroupApi.getGroupMember(groupCode, uid, payload.no_cache)
    if (member) {
      const ret = OB11Entities.groupMember(+groupCode, member)
      const date = Math.trunc(Date.now() / 1000)
      ret.last_sent_time ??= date
      ret.join_time ??= date
      let info: SimpleInfo | null = null
      try {
        info = await this.ctx.ntUserApi.getUserDetailInfoWithBizInfo(member.uid)
      }catch (e) {
        try {
          const fetchInfo = await this.ctx.ntUserApi.fetchUserDetailInfo(member.uid)
          if (fetchInfo) {
            info = fetchInfo.simpleInfo
          }
        }catch (e) {
        }
      }
      if (info) {
        ret.sex = OB11Entities.sex(info.baseInfo.sex!)
        // ret.qq_level = info.qqLevel && calcQQLevel(info.baseInfo.qqLevel) || 0
        ret.age = info.baseInfo.age ?? 0
      }
      return ret
    }
    throw new Error(`群成员${payload.user_id}不存在`)
  }
}

export default GetGroupMemberInfo
