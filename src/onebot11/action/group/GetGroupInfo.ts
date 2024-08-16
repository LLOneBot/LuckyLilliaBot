import { OB11Group } from '../../types'
import { OB11Constructor } from '../../constructor'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQGroupApi } from '@/ntqqapi/api'

interface Payload {
  group_id: number | string
}

class GetGroupInfo extends BaseAction<Payload, OB11Group> {
  actionName = ActionName.GetGroupInfo

  protected async _handle(payload: Payload) {
    const group = (await NTQQGroupApi.getGroups()).find(e => e.groupCode == payload.group_id.toString())
    if (group) {
      return OB11Constructor.group(group)
    } else {
      throw `群${payload.group_id}不存在`
    }
  }
}

export default GetGroupInfo
