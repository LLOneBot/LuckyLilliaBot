import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { GroupMember } from '@/ntqqapi/types'
import { DetailedError } from '@/common/utils'

interface Payload {
  group_id: number | string
}

export class GetGroupShutList extends BaseAction<Payload, GroupMember[]> {
  actionName = ActionName.GetGroupShutList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    try {
      const groupCode = payload.group_id.toString()
      return await this.ctx.ntGroupApi.getGroupShutUpMemberList(groupCode)
    } catch (e) {
      if (e instanceof DetailedError) {
        if (e.data.result === 120271006) {
          return []
        } else {
          throw new Error(e.data.errMsg)
        }
      }
      throw e
    }
  }
}
