import { Friend, SimpleInfo, CategoryFriend } from '../types'
import { ReceiveCmdS } from '../hook'
import { invoke, NTMethod } from '../ntcall'
import { Service, Context } from 'cordis'

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

  async getBuddyV2(): Promise<SimpleInfo[]> {
    const data = await invoke<CategoryFriend[]>(
      'nodeIKernelBuddyService/getBuddyList',
      [true],
      {
        resultCmd: ReceiveCmdS.FRIENDS,
      },
    )
    const result: SimpleInfo[] = data.flatMap((item: CategoryFriend) => item.buddyList)
    return result
  }

  /** uid -> uin */
  async getBuddyIdMap(refresh = false): Promise<Map<string, string>> {
    const retMap: Map<string, string> = new Map()
    const data = await invoke<CategoryFriend[][]
    >(
      'nodeIKernelBuddyService/getBuddyList',
      [refresh],
      {
        resultCmd: ReceiveCmdS.FRIENDS,
      },
    )
    for (const category of data) {
      if (retMap.size > 5000) {
        break
      }
      for (const item of category) {
        for (const buddy of item.buddyList) {
          retMap.set(buddy.uid!, buddy.uin!)
        }
      }
    }
    return retMap
  }

  async getBuddyV2WithCate(refresh = false): Promise<CategoryFriend[]> {
    const data = await invoke<CategoryFriend[][]>(
      'nodeIKernelBuddyService/getBuddyList',
      [refresh],
      {
        resultCmd: ReceiveCmdS.FRIENDS,
      },
    )
    return data[0]
  }

  async isBuddy(uid: string): Promise<boolean> {
    return await invoke('nodeIKernelBuddyService/isBuddy', [uid])
  }

  async getBuddyRecommendContact(uin: string) {
    const ret = await invoke('nodeIKernelBuddyService/getBuddyRecommendContactArkJson', [{ uin }])
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
    },
    ])
  }

  async setBuddyCategory(uid: string, categoryId: number) {
    return await invoke('nodeIKernelBuddyService/setBuddyCategory', [uid, categoryId])
  }
}
