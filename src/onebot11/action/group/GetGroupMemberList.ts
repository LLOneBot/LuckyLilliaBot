import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

class GetGroupMemberList extends BaseAction<Payload, OB11GroupMember[]> {
  actionName = ActionName.GetGroupMemberList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    // 使用缓存可能导致群成员列表不完整
    const res = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
    if (res.errCode !== 0) {
      throw new Error(res.errMsg)
    }
    const groupId = Number(payload.group_id)
    return res.result.infos.values().map(e => OB11Entities.groupMember(groupId, e)).toArray()
  }
}

export default GetGroupMemberList
