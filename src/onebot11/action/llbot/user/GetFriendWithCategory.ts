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
  onlineCount: number
  buddyList: OB11User[]
}

export class GetFriendWithCategory extends BaseAction<{}, Category[]> {
  actionName = ActionName.GetFriendsWithCategory

  protected async _handle() {
    const res = await this.ctx.ntFriendApi.getBuddyV2(true)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    const buddyList = await this.ctx.ntFriendApi.getBuddyList()
    const buddyMap = new Map<string, SimpleInfo>()
    for (const buddy of buddyList) {
      buddyMap.set(buddy.uid!, buddy)
    }
    const category: CategoryFriend[] = []
    for (const item of res.data) {
      const buddyList = []
      for (const uid of item.buddyUids) {
        buddyList.push(buddyMap.get(uid)!)
      }
      category.push({
        ...item,
        buddyList
      })
    }
    return category.map(item => {
      return {
        categoryId: item.categoryId,
        categorySortId: item.categorySortId,
        categoryName: item.categroyName,
        categoryMbCount: item.categroyMbCount,
        onlineCount: item.onlineCount,
        buddyList: item.buddyList!.map(buddy => {
          return OB11Entities.friend(buddy)
        })
      }
    })
  }
}
