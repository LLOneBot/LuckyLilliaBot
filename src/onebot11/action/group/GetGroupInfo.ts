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
    const groupAll = await this.ctx.ntGroupApi.getGroupAllInfo(groupCode)
    const data = {
      group_id: +groupAll.groupCode,
      group_name: groupAll.groupName,
      group_memo: groupAll.richFingerMemo,
      group_create_time: 0,
      member_count: groupAll.memberNum,
      max_member_count: groupAll.maxMemberNum,
      remark_name: groupAll.remarkName,
      avatar_url: `https://p.qlogo.cn/gh/${groupAll.groupCode}/${groupAll.groupCode}/0`,
      groupAll,
    }
    const group = (await this.ctx.ntGroupApi.getGroups()).find(e => e.groupCode === groupCode)
    if (group) {
      data.group_create_time = +group.createTime
    }
    return data
  }
}

export default GetGroupInfo
