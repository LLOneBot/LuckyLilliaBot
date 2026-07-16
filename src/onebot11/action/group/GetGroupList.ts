import { OB11Group } from '../../types'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  no_cache: boolean
}

class GetGroupList extends BaseAction<Payload, OB11Group[]> {
  actionName = ActionName.GetGroupList
  payloadSchema = Schema.object({
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload) {
    const groups = await this.ctx.ntGroupApi.getGroups(payload.no_cache)
    return groups.map(group => ({
      group_id: group.groupCode,
      group_name: group.groupName,
      group_memo: group.description,
      group_create_time: group.createdAt,
      member_count: group.memberCount,
      max_member_count: group.maxMemberCount,
      remark_name: group.remark,
      avatar_url: `https://p.qlogo.cn/gh/${group.groupCode}/${group.groupCode}/0`,
      owner_id: 0,
      is_top: group.isPin,
      shut_up_all_timestamp: group.groupShutupExpireTime,
      shut_up_me_timestamp: group.personShutupExpireTime
    }))
  }
}

export default GetGroupList
