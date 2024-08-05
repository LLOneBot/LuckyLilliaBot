import { OB11User } from '../../types'
import { OB11Constructor } from '../../constructor'
import { friends, rawFriends } from '@/common/data'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQFriendApi } from '@/ntqqapi/api'
import { CategoryFriend } from '@/ntqqapi/types'
import { qqPkgInfo } from '@/common/utils/QQBasicInfo'

interface Payload {
  no_cache: boolean | string
}

export class GetFriendList extends BaseAction<Payload, OB11User[]> {
  actionName = ActionName.GetFriendList

  protected async _handle(payload: Payload) {
    if (+qqPkgInfo.buildVersion >= 26702) {
      return OB11Constructor.friendsV2(await NTQQFriendApi.getBuddyV2(payload?.no_cache === true || payload?.no_cache === 'true'))
    }
    if (friends.length === 0 || payload?.no_cache === true || payload?.no_cache === 'true') {
      const _friends = await NTQQFriendApi.getFriends(true)
      // log('强制刷新好友列表，结果: ', _friends)
      if (_friends.length > 0) {
        friends.length = 0
        friends.push(..._friends)
      }
    }
    return OB11Constructor.friends(friends)
  }
}


export class GetFriendWithCategory extends BaseAction<void, Array<CategoryFriend>> {
  actionName = ActionName.GetFriendsWithCategory;

  protected async _handle(payload: void) {
    return rawFriends;
  }
}