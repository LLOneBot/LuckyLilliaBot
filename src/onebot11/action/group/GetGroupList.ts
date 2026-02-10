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
    return await Promise.all(groups.map(async group => ({
      group_id: +group.groupCode,
      group_name: group.groupName,
      group_memo: '',
      group_create_time: +group.createTime,
      member_count: group.memberCount,
      max_member_count: group.maxMember,
      remark_name: group.remarkName,
      avatar_url: `https://p.qlogo.cn/gh/${group.groupCode}/${group.groupCode}/0`,
      owner_id: +group.groupOwnerId.memberUin || +(await this.ctx.ntUserApi.getUinByUid(group.groupOwnerId.memberUid)),
      is_top: group.isTop,
      shut_up_all_timestamp: +group.groupShutupExpireTime,
      shut_up_me_timestamp: +group.personShutupExpireTime
    })))
  }
}

export default GetGroupList
