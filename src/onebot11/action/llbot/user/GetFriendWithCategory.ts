import { BaseAction } from '../../BaseAction'
import { OB11User } from '../../../types'
import { OB11Entities } from '../../../entities'
import { ActionName } from '../../types'

interface Category {
  categoryId: number
  categorySortId: number
  categoryName: string
  categoryMbCount: number
  onlineCount: number
  buddyList: OB11User[]
}

export class GetFriendWithCategory extends BaseAction<{}, Category[]> {
  actionName = ActionName.GetFriendsWithCategory

  protected async _handle() {
    const result = await this.ctx.ntFriendApi.getFriends(true)
    const status = await this.ctx.ntFriendApi.getFriendsStatus()
    return result.categories.values().map(item => {
      const buddy = result.friends
        .filter(friend => friend.categoryId === item.categoryId)
      return {
        categoryId: item.categoryId,
        categorySortId: item.categorySortId,
        categoryName: item.categoryName,
        categoryMbCount: item.categoryMemberCount,
        onlineCount: buddy
          .filter(friend => status.find(e => e.uid === friend.uid)?.status !== 20)
          .length,
        buddyList: buddy.map(friend => {
          return OB11Entities.friend(friend)
        })
      }
    }).toArray()
  }
}
