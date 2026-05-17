import { Category, Friend } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'

declare module 'cordis' {
  interface Context {
    ntFriendApi: NTQQFriendApi
  }
}

export class NTQQFriendApi extends Service {
  static inject = ['ntUserApi', 'ntSystemApi', 'pmhq']
  private friendsCache: Friend[] = []
  private categoriesCache: Map<number, Category> = new Map()

  constructor(protected ctx: Context) {
    super(ctx, 'ntFriendApi')
  }

  async getFriendList(forceUpdate: boolean) {
    if (forceUpdate || this.friendsCache.length === 0) {
      const res = await this.ctx.pmhq.fetchFriends()
      this.categoriesCache.clear()
      for (const cat of res.category) {
        this.categoriesCache.set(cat.categoryId, cat)
      }
      this.friendsCache = res.friendList.map(friend => {
        const biz = friend.subBiz.get(1)!
        let statusId = biz.numData.get(27372)!
        if (statusId >= 268435456) {
          statusId -= 268435456
        }
        if (statusId > 14878464) {
          statusId -= 14878464
        }
        return {
          uid: friend.uid,
          uin: friend.uin,
          categoryId: friend.categoryId,
          categoryName: this.categoriesCache.get(friend.categoryId)!.categoryName,
          nick: biz.data.get(20002)!.toString(),
          longNick: biz.data.get(102)!.toString(),
          remark: biz.data.get(103)!.toString(),
          qid: biz.data.get(27394)!.toString(),
          age: biz.numData.get(20037)!,
          sex: biz.numData.get(20009)!,
          birthdayYear: (biz.data.get(20031)![0] << 8) | biz.data.get(20031)![1],
          birthdayMonth: biz.data.get(20031)![2],
          birthdayDay: biz.data.get(20031)![3],
          status: statusId === 0 ? 20 : statusId * 10
        }
      })
    }
    return {
      friends: this.friendsCache,
      categories: this.categoriesCache
    }
  }

  async getFriendInfoByUin(uin: number, forceUpdate: boolean) {
    const result = await this.getFriendList(forceUpdate)
    let friend = result.friends.find(e => e.uin === uin)
    if (!friend) {
      const result = await this.getFriendList(true)
      friend = result.friends.find(e => e.uin === uin)
    }
    if (!friend) {
      return
    }
    return friend
  }

  async getFriendInfoByUid(uid: string, forceUpdate: boolean) {
    const result = await this.getFriendList(forceUpdate)
    let friend = result.friends.find(e => e.uid === uid)
    if (!friend) {
      const result = await this.getFriendList(true)
      friend = result.friends.find(e => e.uid === uid)
    }
    if (!friend) {
      return
    }
    return friend
  }

  async isFriend(uid: string): Promise<boolean> {
    return (await this.getFriendInfoByUid(uid, false)) !== undefined
  }

  async getFriendRecommendContactArk(uin: number) {
    const { ark } = await this.ctx.pmhq.getFriendRecommendContactArk(uin)
    return ark
  }

  async setFriendRemark(uid: string, remark = '') {
    return await this.ctx.pmhq.setFriendRemark(uid, remark)
  }

  async deleteFriend(targetUid: string, block = false, bothDelete = true) {
    return await this.ctx.pmhq.deleteFriend(targetUid, block, bothDelete)
  }

  async setFriendCategory(uid: string, categoryId: number) {
    return await this.ctx.pmhq.setFriendCategory(uid, categoryId)
  }

  async clearBuddyReqUnreadCnt() {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/clearBuddyReqUnreadCnt', [])
  }

  async getFriendRequests(limit: number) {
    const { info } = await this.ctx.pmhq.fetchFriendRequests(selfInfo.uid, limit)
    return info.requests
  }

  async getDoubtFriendRequests(limit: number) {
    const { info } = await this.ctx.pmhq.fetchFilteredFriendRequests(limit)
    return info.requests
  }

  async approvalFriendRequest(friendUid: string, accept: boolean) {
    await this.ctx.pmhq.setFriendRequest(friendUid, accept ? 3 : 5)
  }

  async approvalDoubtFriendRequest(requestUid: string) {
    return await this.ctx.pmhq.setFilteredFriendRequestReq(selfInfo.uid, requestUid)
  }

  async setFriendPin(friendUid: string, isPinned: boolean) {
    return await this.ctx.pmhq.setFriendPin(friendUid, isPinned)
  }
}
