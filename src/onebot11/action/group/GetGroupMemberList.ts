import { OB11GroupMember } from '../../types'
import { getGroup } from '../../../common/data'
import { OB11Constructor } from '../../constructor'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQGroupApi } from '../../../ntqqapi/api/group'
import { log } from '../../../common/utils'

export interface PayloadType {
  group_id: number
  no_cache: boolean | string
}

class GetGroupMemberList extends BaseAction<PayloadType, OB11GroupMember[]> {
  actionName = ActionName.GetGroupMemberList

  protected async _handle(payload: PayloadType) {
    const group = await getGroup(payload.group_id.toString())
    if (group) {
      if (!group.members?.length || payload.no_cache === true || payload.no_cache === 'true') {
        const members = await NTQQGroupApi.getGroupMembers(payload.group_id.toString())
        group.members = Array.from(members.values())
        log('强制刷新群成员列表, 数量: ', group.members.length)
      }
      return OB11Constructor.groupMembers(group)
    } else {
      throw `群${payload.group_id}不存在`
    }
  }
}

export default GetGroupMemberList
