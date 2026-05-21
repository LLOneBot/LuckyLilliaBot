import { parseBool } from '@/common/utils'
import { OB11Group } from '../../types'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  no_cache: boolean
}

class GetGroupInfo extends BaseAction<Payload, OB11Group> {
  actionName = ActionName.GetGroupInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    // 默认刷新缓存以保证返回的群信息（特别是群名）是最新的
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })

  protected async _handle(payload: Payload) {
    const group = await this.ctx.ntGroupApi.getGroup(+payload.group_id, payload.no_cache)
    return {
      group_id: group.groupCode,
      group_name: group.groupName,
      group_memo: group.description,
      group_create_time: group.createdAt,
      member_count: group.memberCount,
      max_member_count: group.maxMemberCount,
      remark_name: group.remark,
      avatar_url: `https://p.qlogo.cn/gh/${group.groupCode}/${group.groupCode}/0`,
      owner_id: Number(await this.ctx.ntUserApi.getUinByUid(group.ownerUid)),  // 群主 QQ 号
      is_top: group.isPin,  // 是否置顶群聊
      shut_up_all_timestamp: group.groupShutupExpireTime,  // 群全员禁言截止时间
      shut_up_me_timestamp: group.personShutupExpireTime  // 我被禁言截止时间
    }
  }
}

export default GetGroupInfo
