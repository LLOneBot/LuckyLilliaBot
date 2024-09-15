import { OB11Group } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

class GetGroupInfo extends BaseAction<Payload, OB11Group> {
  actionName = ActionName.GetGroupInfo

  protected async _handle(payload: Payload) {
    const group = (await this.ctx.ntGroupApi.getGroups()).find(e => e.groupCode == payload.group_id.toString())
    if (group) {
      return OB11Entities.group(group)
    } else {
      throw `群${payload.group_id}不存在`
    }
  }
}

export default GetGroupInfo
