import { CategoryFriend, SimpleInfo } from '../types'
import { ReceiveCmdS } from '../hook'
import { invoke, NTMethod } from '../ntcall'
import { Context, Service } from 'cordis'
import { uidUinBidiMap } from '@/ntqqapi/cache'

declare module 'cordis' {
  interface Context {
    ntFriendApi: NTQQFriendApi
  }
}

export class NTQQFriendApi extends Service {
  constructor(protected ctx: Context) {
    super(ctx, 'ntFriendApi', true)
  }

  async handleFriendRequest(friendUid: string, reqTime: string, accept: boolean) {
    return await invoke(NTMethod.HANDLE_FRIEND_REQUEST, [{
      friendUid,
      reqTime,
      accept,
    },
    ])
  }

  async getBuddyList(): Promise<SimpleInfo[]> {
    const data = await invoke<SimpleInfo[]>(
      'getBuddyList',
      [],
      {},
    )
    for (const item of data) {
      if (item.uid && item.uin) {
        uidUinBidiMap.set(item.uid, item.uin);
      }
    }
    return data
  }

  async getBuddyV2(refresh = false): Promise<SimpleInfo[]> {
    const data = await this.getBuddyV2WithCate(false)
    return data.flatMap((item: CategoryFriend) => item.buddyList)
  }

  async getBuddyV2WithCate(refresh = false): Promise<CategoryFriend[]> {
    const categoryData = (await invoke<{ data: CategoryFriend[] }>(
      'nodeIKernelBuddyService/getBuddyListV2',
      [refresh, 0],
      {
      },
    )).data
    const buddyList = await this.getBuddyList();
    const buddyMap = new Map<string, SimpleInfo>();
    for (const buddy of buddyList) {
      buddyMap.set(buddy.uid!, buddy)
    }
    for (const category of categoryData) {
      category.buddyList = []
      for (const uid of category.buddyUids) {
        category.buddyList.push(buddyMap.get(uid)!)
      }
    }
    return categoryData
  }

  async isBuddy(uid: string): Promise<boolean> {
    return await invoke('nodeIKernelBuddyService/isBuddy', [uid])
  }

  async getBuddyRecommendContact(uin: string) {
    const ret = await invoke('nodeIKernelBuddyService/getBuddyRecommendContactArkJson', [uin, '-'])
    return ret.arkMsg
  }

  async setBuddyRemark(uid: string, remark = '') {
    return await invoke('nodeIKernelBuddyService/setBuddyRemark', [
      { uid, remark },
    ])
  }

  async delBuddy(friendUid: string) {
    return await invoke('nodeIKernelBuddyService/delBuddy', [{
      friendUid,
      tempBlock: false,
      tempBothDel: true,
    }])
  }

  async setBuddyCategory(uid: string, categoryId: number) {
    return await invoke('nodeIKernelBuddyService/setBuddyCategory', [uid, categoryId])
  }
}
