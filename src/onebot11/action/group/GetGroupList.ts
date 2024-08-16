import { OB11Group } from '../../types'
import { OB11Constructor } from '../../constructor'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQGroupApi } from '../../../ntqqapi/api'

interface Payload {
  no_cache: boolean | string
}

class GetGroupList extends BaseAction<Payload, OB11Group[]> {
  actionName = ActionName.GetGroupList

  protected async _handle(payload: Payload) {
    const groupList = await NTQQGroupApi.getGroups(payload?.no_cache === true || payload.no_cache === 'true')
    return OB11Constructor.groups(groupList)
  }
}

export default GetGroupList
