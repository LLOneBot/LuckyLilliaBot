import { BaseAction } from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { getBuildVersion } from '@/common/utils'

export class GetFriendWithCategory extends BaseAction<void, OB11User[]> {
  actionName = ActionName.GetFriendsWithCategory

  protected async _handle() {
    if (getBuildVersion() >= 26702) {
      return OB11Entities.friendsV2(await this.ctx.ntFriendApi.getBuddyV2ExWithCate(true))
    } else {
      throw new Error('this ntqq version not support, must be 26702 or later')
    }
  }
}
