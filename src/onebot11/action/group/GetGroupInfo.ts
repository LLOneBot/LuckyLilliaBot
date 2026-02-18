import { OB11Group } from '../../types'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

class GetGroupInfo extends BaseAction<Payload, OB11Group> {
  actionName = ActionName.GetGroupInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const groupDetail = await this.ctx.ntGroupApi.getGroupDetailInfo(groupCode)
    return {
      group_id: +groupDetail.groupCode,
      group_name: groupDetail.groupName,
      group_memo: groupDetail.richFingerMemo,
      group_create_time: groupDetail.groupCreateTime,
      member_count: groupDetail.memberNum,
      max_member_count: groupDetail.maxMemberNum,
      remark_name: groupDetail.remarkName,
      avatar_url: `https://p.qlogo.cn/gh/${groupDetail.groupCode}/${groupDetail.groupCode}/0`,
      // 以下是非 OneBot 11 标准字段
      owner_id: +groupDetail.ownerUin || +(await this.ctx.ntUserApi.getUinByUid(groupDetail.ownerUid)),  // 群主 QQ 号
      is_top: groupDetail.isTop,  // 是否置顶群聊
      shut_up_all_timestamp: groupDetail.shutUpAllTimestamp,  // 群全员禁言截止时间
      shut_up_me_timestamp: groupDetail.shutUpMeTimestamp,  // 我被禁言截止时间
      is_freeze: groupDetail.isGroupFreeze === 1,  // 群是否被冻结
      active_member_count: groupDetail.activeMemberNum  // 活跃成员数
    }
  }
}

export default GetGroupInfo
