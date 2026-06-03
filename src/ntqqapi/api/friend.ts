import { FriendCategory, Friend } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'

declare module 'cordis' {
  interface Context {
    ntFriendApi: NTQQFriendApi
  }
}

export class NTQQFriendApi extends Service {
  static inject = ['qqProtocol', 'store']
  private friendsCache: Friend[] = []
  private categoriesCache: Map<number, FriendCategory> = new Map()

  constructor(protected ctx: Context) {
    super(ctx, 'ntFriendApi')
    ctx.on('nt/friend-added', () => {
      if (this.friendsCache.length > 0) {
        this.getFriends(true)
      }
    })
    ctx.on('nt/friend-removed', () => {
      if (this.friendsCache.length > 0) {
        this.getFriends(true)
      }
    })
  }

  async getFriends(forceUpdate: boolean) {
    if (forceUpdate || this.friendsCache.length === 0) {
      const friends = []
      const categories = new Map<number, FriendCategory>()
      let cookie: Buffer | undefined
      while (true) {
        const res = await this.ctx.qqProtocol.fetchFriends(cookie)
        for (const cat of res.category) {
          categories.set(cat.categoryId, cat)
        }
        for (const friend of res.friendList) {
          const biz = friend.subBiz.get(1)!
          let statusId = biz.numData.get(27372)!
          if (statusId >= 268435456) {
            statusId -= 268435456
          }
          if (statusId > 14878464) {
            statusId -= 14878464
          }
          friends.push({
            uid: friend.uid,
            uin: friend.uin,
            categoryId: friend.categoryId,
            categoryName: categories.get(friend.categoryId)!.categoryName,
            nick: biz.data.get(20002)!.toString(),
            bio: biz.data.get(102)!.toString(),
            remark: biz.data.get(103)!.toString(),
            qid: biz.data.get(27394)!.toString(),
            age: biz.numData.get(20037)!,
            gender: biz.numData.get(20009)!,
            birthdayYear: (biz.data.get(20031)![0] << 8) | biz.data.get(20031)![1],
            birthdayMonth: biz.data.get(20031)![2],
            birthdayDay: biz.data.get(20031)![3],
            status: statusId
          })
        }
        cookie = res.cookie
        if (!cookie) break
      }
      this.friendsCache = friends
      this.categoriesCache = categories
    }
    return {
      friends: this.friendsCache,
      categories: this.categoriesCache
    }
  }

  async getFriendByUin(uin: number, forceUpdate: boolean) {
    const result = await this.getFriends(forceUpdate)
    let friend = result.friends.find(e => e.uin === uin)
    if (!friend) {
      const result = await this.getFriends(true)
      friend = result.friends.find(e => e.uin === uin)
    }
    return friend
  }

  async getFriendByUid(uid: string, forceUpdate: boolean) {
    const result = await this.getFriends(forceUpdate)
    let friend = result.friends.find(e => e.uid === uid)
    if (!friend) {
      const result = await this.getFriends(true)
      friend = result.friends.find(e => e.uid === uid)
    }
    return friend
  }

  async isFriend(uid: string) {
    const result = await this.getFriends(false)
    return result.friends.some(e => e.uid === uid)
  }

  async getFriendRecommendContactArk(uin: number) {
    const { ark } = await this.ctx.qqProtocol.getFriendRecommendContactArk(uin)
    return ark
  }

  async setFriendRemark(uid: string, remark = '') {
    return await this.ctx.qqProtocol.setFriendRemark(uid, remark)
  }

  async deleteFriend(targetUid: string, block = false, bothDelete = true) {
    return await this.ctx.qqProtocol.deleteFriend(targetUid, block, bothDelete)
  }

  async setFriendCategory(uid: string, categoryId: number) {
    return await this.ctx.qqProtocol.setFriendCategory(uid, categoryId)
  }

  async getFriendRequests(limit: number) {
    const { info } = await this.ctx.qqProtocol.fetchFriendRequests(selfInfo.uid, limit)
    return info.requests
  }

  async getDoubtFriendRequests(limit: number) {
    const { info } = await this.ctx.qqProtocol.fetchFilteredFriendRequests(limit)
    return info.requests
  }

  async approvalFriendRequest(friendUid: string, accept: boolean) {
    return await this.ctx.qqProtocol.setFriendRequest(friendUid, accept ? 3 : 5)
  }

  async approvalDoubtFriendRequest(requestUid: string) {
    return await this.ctx.qqProtocol.setFilteredFriendRequestReq(selfInfo.uid, requestUid)
  }

  async setFriendPin(friendUid: string, isPinned: boolean) {
    return await this.ctx.qqProtocol.setFriendPin(friendUid, isPinned)
  }

  async sendFriendNudge(friendUin: number, isSelf: boolean) {
    const toUin = isSelf ? +selfInfo.uin : friendUin
    return await this.ctx.qqProtocol.sendFriendPoke(friendUin, toUin)
  }
}
