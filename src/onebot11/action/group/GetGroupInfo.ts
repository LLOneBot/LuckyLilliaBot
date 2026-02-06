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
    }
  }
}

export default GetGroupInfo
