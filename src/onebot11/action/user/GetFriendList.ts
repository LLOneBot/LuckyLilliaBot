import { BaseAction } from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'

export class GetFriendList extends BaseAction<{}, OB11User[]> {
  actionName = ActionName.GetFriendList

  protected async _handle() {
    const buddyList = await this.ctx.ntFriendApi.getBuddyList()
    return OB11Entities.friends(buddyList)
  }
}
