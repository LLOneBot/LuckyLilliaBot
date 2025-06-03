import { BaseAction, Schema } from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  no_cache: boolean
}

export class GetFriendList extends BaseAction<Payload, OB11User[]> {
  actionName = ActionName.GetFriendList
  payloadSchema = Schema.object({
    no_cache: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload) {
    const refresh = payload.no_cache
    return OB11Entities.friendsV2(await this.ctx.ntFriendApi.getBuddyV2(refresh))
  }
}
