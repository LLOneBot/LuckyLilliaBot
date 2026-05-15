import { BaseAction } from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'

export class GetFriendList extends BaseAction<{}, OB11User[]> {
  actionName = ActionName.GetFriendList

  protected async _handle() {
    const result = await this.ctx.ntFriendApi.getFriendList(true)
    return OB11Entities.friends(result.friends)
  }
}
