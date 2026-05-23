import { BaseAction } from '../../BaseAction'
import { OB11User } from '../../../types'
import { OB11Entities } from '../../../entities'
import { ActionName } from '../../types'
import { CategoryFriend, SimpleInfo } from '@/ntqqapi/types'

interface Category {
  categoryId: number
  categorySortId: number
  categoryName: string
  categoryMbCount: number
  buddyList: OB11User[]
}

export class GetFriendWithCategory extends BaseAction<{}, Category[]> {
  actionName = ActionName.GetFriendsWithCategory

  protected async _handle() {
    const result = await this.ctx.ntFriendApi.getFriendList(true)
    return result.categories.values().map(item => ({
      categoryId: item.categoryId,
      categorySortId: item.categorySortId,
      categoryName: item.categoryName,
      categoryMbCount: item.categoryMemberCount,
      buddyList: result.friends
        .filter(friend => friend.categoryId === item.categoryId)
        .map(friend => {
          return OB11Entities.friend(friend)
        })
    })).toArray()
  }
}
