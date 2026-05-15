import { Category, Friend } from '../types'
import { Context, Service } from 'cordis'
import { GeneralCallResult } from '../services'
import { selfInfo } from '@/common/globalVars'

declare module 'cordis' {
  interface Context {
    ntFriendApi: NTQQFriendApi
  }
}

export class NTQQFriendApi extends Service {
  static inject = ['ntUserApi', 'ntSystemApi', 'pmhq']
  friendsCache: Friend[] = []
  categoriesCache: Map<number, Category> = new Map()

  constructor(protected ctx: Context) {
    super(ctx, 'ntFriendApi')
  }

  async approvalFriendRequest(friendUid: string, accept: boolean) {
    await this.ctx.pmhq.setFriendRequest(friendUid, accept ? 3 : 5)
  }

  async getFriendList(forceUpdate: boolean) {
    if (forceUpdate || this.friendsCache.length === 0) {
      const res = await this.ctx.pmhq.fetchFriends()
      this.friendsCache = res.friendList.map(friend => {
        const biz = friend.subBiz.get(1)!
        return {
          uid: friend.uid,
          uin: friend.uin,
          categoryId: friend.categoryId,
          nick: biz.data.get(20002)!.toString(),
          longNick: biz.data.get(102)!.toString(),
          remark: biz.data.get(103)!.toString(),
          qid: biz.data.get(27394)!.toString(),
          age: biz.numData.get(20037)!,
          sex: biz.numData.get(20009)!,
          birthdayYear: (biz.data.get(20031)![0] << 8) | biz.data.get(20031)![1],
          birthdayMonth: biz.data.get(20031)![2],
          birthdayDay: biz.data.get(20031)![3],
        }
      })
      this.categoriesCache.clear()
      for (const cat of res.category) {
        this.categoriesCache.set(cat.categoryId, cat)
      }
    }
    return {
      friends: this.friendsCache,
      categories: this.categoriesCache
    }
  }

  async getFriendInfoByUin(uin: number, forceUpdate: boolean) {
    const result = await this.getFriendList(forceUpdate)
    let categories = result.categories
    let friend = result.friends.find(e => e.uin === uin)
    if (!friend) {
      const result = await this.getFriendList(true)
      categories = result.categories
      friend = result.friends.find(e => e.uin === uin)
    }
    if (!friend) {
      return
    }
    const category = categories.get(friend.categoryId)!
    return {
      friend,
      category
    }
  }

  async getFriendInfoByUid(uid: string, forceUpdate: boolean) {
    const result = await this.getFriendList(forceUpdate)
    let categories = result.categories
    let friend = result.friends.find(e => e.uid === uid)
    if (!friend) {
      const result = await this.getFriendList(true)
      categories = result.categories
      friend = result.friends.find(e => e.uid === uid)
    }
    if (!friend) {
      return
    }
    const category = categories.get(friend.categoryId)!
    return {
      friend,
      category
    }
  }

  async isFriend(uid: string): Promise<boolean> {
    return (await this.getFriendInfoByUid(uid, false)) !== undefined
  }

  async getFriendRecommendContactArk(uin: number) {
    const { ark } = await this.ctx.pmhq.getFriendRecommendContactArk(uin)
    return ark
  }

  async setBuddyRemark(uid: string, remark = '') {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/setBuddyRemark', [
      { uid, remark },
    ])
  }

  async delBuddy(friendUid: string) {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/delBuddy', [{
      friendUid,
      tempBlock: false,
      tempBothDel: true,
    }])
  }

  async setBuddyCategory(uid: string, categoryId: number) {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/setBuddyCategory', [uid, categoryId])
  }

  async clearBuddyReqUnreadCnt() {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/clearBuddyReqUnreadCnt', [])
  }

  async getDoubtBuddyReq(reqNum: number) {
    const reqId = Date.now().toString()
    return await this.ctx.pmhq.invoke(
      'nodeIKernelBuddyService/getDoubtBuddyReq',
      [reqId, reqNum, ''],
      {
        resultCmd: 'nodeIKernelBuddyListener/onDoubtBuddyReqChange',
        resultCb: payload => payload.reqId === reqId
      }
    )
  }

  async approvalDoubtFriendRequest(requestUid: string) {
    return await this.ctx.pmhq.setFilteredFriendRequestReq(selfInfo.uid, requestUid)
  }

  async getBuddyReq() {
    return await this.ctx.pmhq.invoke(
      'nodeIKernelBuddyService/getBuddyReq',
      [],
      {
        resultCmd: 'nodeIKernelBuddyListener/onBuddyReqChange'
      }
    )
  }

  async getCategoryById(categoryId: number) {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/getCategoryById', [categoryId])
  }

  async setTop(uid: string, isTop: boolean) {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/setTop', [uid, isTop])
  }
}
