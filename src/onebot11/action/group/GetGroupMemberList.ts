import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  group_id: number | string
  no_cache: boolean
}

class GetGroupMemberList extends BaseAction<Payload, OB11GroupMember[]> {
  actionName = ActionName.GetGroupMemberList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    let groupMembers = await this.ctx.ntGroupApi.getGroupMembers(groupCode, payload.no_cache)
    for (let i = 0; i < 5; i++) {
      if (groupMembers.size > 0) {
        break
      }
      await this.ctx.sleep(60)
      groupMembers = await this.ctx.ntGroupApi.getGroupMembers(groupCode, payload.no_cache)
    }

    const date = Math.trunc(Date.now() / 1000)
    const groupId = Number(payload.group_id)
    const ret: OB11GroupMember[] = []

    for (const item of groupMembers.values()) {
      const member = OB11Entities.groupMember(groupId, item)
      member.join_time ??= date
      member.last_sent_time ??= date
      ret.push(member)
    }

    return ret
  }
}

export default GetGroupMemberList
