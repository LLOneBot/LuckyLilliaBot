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

  private async getMembers(groupCode: string, forceFetch: boolean) {
    const res = await this.ctx.ntGroupApi.getGroupMembers(groupCode, forceFetch)
    if (res.errCode !== 0) {
      throw new Error(res.errMsg)
    }
    return res.result
  }

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    let result
    if (payload.no_cache) {
      result = await this.getMembers(groupCode, true)
    } else {
      let cached = false
      try {
        result = await this.getMembers(groupCode, false)
        cached = true
      } catch {
        result = await this.getMembers(groupCode, true)
      }
      if (cached) {
        const { memberNum } = await this.ctx.ntGroupApi.getGroupAllInfo(groupCode)
        // 使用缓存可能导致群成员列表不完整
        if (memberNum !== result.infos.size) {
          result = await this.getMembers(groupCode, true)
        }
      }
    }
    const groupId = Number(payload.group_id)
    return result.infos.values().map(e => OB11Entities.groupMember(groupId, e)).toArray()
  }
}

export default GetGroupMemberList
