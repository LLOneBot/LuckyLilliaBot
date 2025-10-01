import { OB11Group } from '../../types'
import { OB11Entities } from '../../entities'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  no_cache: boolean
}

class GetGroupList extends BaseAction<Payload, OB11Group[]> {
  actionName = ActionName.GetGroupList
  payloadSchema = Schema.object({
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload) {
    const groupList = await this.ctx.ntGroupApi.getGroups(payload.no_cache)
    return OB11Entities.groups(groupList)
  }
}

export default GetGroupList
