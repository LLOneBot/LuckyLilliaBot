import { BaseAction, Schema } from '../BaseAction'
import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { calcQQLevel, parseBool } from '@/common/utils/misc'
import { UserDetailInfo } from '@/ntqqapi/types'

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
    const ret = OB11Entities.groupMember(+groupCode, member)
    let info: UserDetailInfo | undefined
    try {
      info = await this.ctx.ntUserApi.getUserDetailInfoWithBizInfo(member.uid)
    } catch (e) {
      try {
        const fetchInfo = await this.ctx.ntUserApi.fetchUserDetailInfo(member.uid)
        if (fetchInfo) {
          info = fetchInfo.detail.get(member.uid)
        }
      } catch (e) {
      }
    }
    if (info) {
      ret.sex = OB11Entities.sex(info.simpleInfo.baseInfo.sex)
      ret.qq_level = info.commonExt?.qqLevel && calcQQLevel(info.commonExt.qqLevel) || 0
      ret.age = info.simpleInfo.baseInfo.age ?? 0
    }
    if (ret.qq_level === 0) {
      ret.qq_level = (await this.ctx.app.pmhq.fetchUserInfo(+payload.user_id)).level
    }
    return ret
  }
}

export default GetGroupMemberInfo
