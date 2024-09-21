import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  no_cache?: boolean | string
}

class GetGroupMemberList extends BaseAction<Payload, OB11GroupMember[]> {
  actionName = ActionName.GetGroupMemberList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    let groupMembers = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
    if (groupMembers.size === 0) {
      await this.ctx.sleep(100)
      groupMembers = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
    }
    const groupMembersArr = Array.from(groupMembers.values())
    const date = Math.round(Date.now() / 1000)

    return groupMembersArr.map(item => {
      const member = OB11Entities.groupMember(groupCode, item)
      member.join_time ??= date
      member.last_sent_time ??= date
      return member
    })
  }
}

export default GetGroupMemberList
