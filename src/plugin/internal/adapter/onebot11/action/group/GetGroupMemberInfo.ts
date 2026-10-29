import { BaseAction, Schema } from '../BaseAction'
import { OB11GroupMember } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  group_id: number | string
  user_id: number | string
  no_cache: boolean
}

class GetGroupMemberInfo extends BaseAction<Payload, OB11GroupMember> {
  actionName = ActionName.GetGroupMemberInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required(),
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload) {
    const member = await this.ctx.ntGroupApi.getGroupMemberByUin(
      +payload.group_id,
      +payload.user_id,
      payload.no_cache
    )
    if (!member) {
      throw new Error('群成员未找到')
    }
    const ret = OB11Entities.groupMember(+payload.group_id, member)
    const info = await this.ctx.ntUserApi.getUserByUin(+payload.user_id)
    ret.sex = OB11Entities.sex(info.gender)
    ret.qq_level = info.level
    ret.age = info.age
    return ret
  }
}

export default GetGroupMemberInfo
