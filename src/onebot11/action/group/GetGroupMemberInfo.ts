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
    const member = await this.ctx.ntGroupApi.getGroupMemberByUin(
      +payload.group_id,
      +payload.user_id,
      payload.no_cache
    )
    if (!member) {
      throw new Error('群成员未找到')
    }
    const ret = OB11Entities.groupMember(+payload.group_id, member)
    let info: UserDetailInfo | undefined
    try {
      info = await this.ctx.ntUserApi.getUserDetailInfoWithBizInfo(member.uid)
    } catch (e) {
      try {
        const fetchInfo = await this.ctx.ntUserApi.fetchUserDetailInfo(member.uid)
        info = fetchInfo as unknown as UserDetailInfo
      } catch (e) {
      }
    }
    if (info?.commonExt) {
      ret.sex = OB11Entities.sex(info.simpleInfo.baseInfo.sex)
      ret.qq_level = calcQQLevel(info.commonExt.qqLevel)
      ret.age = info.simpleInfo.baseInfo.age
      if (ret.qq_level === 0) {
        ret.qq_level = (await this.ctx.qqProtocol.fetchUserInfo(+payload.user_id)).level
      }
    } else {
      const info = await this.ctx.qqProtocol.fetchUserInfo(+payload.user_id)
      ret.sex = OB11Entities.sex(info.sex)
      ret.qq_level = info.level
      ret.age = info.age
    }
    return ret
  }
}

export default GetGroupMemberInfo
