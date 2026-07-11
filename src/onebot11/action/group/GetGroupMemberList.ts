import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils'

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
    const groupId = +payload.group_id
    const result = await this.ctx.ntGroupApi.getGroupMembers(groupId, payload.no_cache)
    return result.map(e => OB11Entities.groupMember(groupId, e))
  }
}

export default GetGroupMemberList
