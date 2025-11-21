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
    const data = await this.ctx.ntFriendApi.getBuddyV2WithCate(true)
    return data.map(item => {
      return {
        categoryId: item.categoryId,
        categorySortId: item.categorySortId,
        categoryName: item.categroyName,
        categoryMbCount: item.categroyMbCount,
        onlineCount: item.onlineCount,
        buddyList: item.buddyList.map(buddy => {
          return OB11Entities.friend(buddy)
        })
      }
    })
  }
}
