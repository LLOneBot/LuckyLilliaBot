import { OB11Group } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

class GetGroupInfo extends BaseAction<Payload, OB11Group> {
  actionName = ActionName.GetGroupInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const group = (await this.ctx.ntGroupApi.getGroups()).find(e => e.groupCode === groupCode)
    if (group) {
      return OB11Entities.group(group)
    }
    throw new Error(`群${payload.group_id}不存在`)
  }
}

export default GetGroupInfo
