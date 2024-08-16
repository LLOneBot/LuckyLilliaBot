import { Friend, FriendV2 } from '../types'
import { ReceiveCmdS } from '../hook'
import { callNTQQApi, GeneralCallResult, NTQQApiMethod } from '../ntcall'
import { getSession } from '@/ntqqapi/wrapper'
import { BuddyListReqType, NodeIKernelProfileService } from '../services'
import { NTEventDispatch } from '@/common/utils/EventTask'
import { CacheClassFuncAsyncExtend } from '@/common/utils/helper'
import { LimitedHashTable } from '@/common/utils/table'

export class NTQQFriendApi {
  /** 大于或等于 26702 应使用 getBuddyV2 */
  static async getFriends(forced = false) {
    const data = await callNTQQApi<{
      data: {
        categoryId: number
        categroyName: string
        categroyMbCount: number
        buddyList: Friend[]
      }[]
    }>({
      methodName: NTQQApiMethod.FRIENDS,
      args: [{ force_update: forced }, undefined],
      cbCmd: ReceiveCmdS.FRIENDS,
      afterFirstCmd: false,
    })
    // log('获取好友列表', data)
    let _friends: Friend[] = []
    for (const fData of data.data) {
      _friends.push(...fData.buddyList)
    }
    return _friends
  }

  static async likeFriend(uid: string, count = 1) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.LIKE_FRIEND,
      args: [
        {
          doLikeUserInfo: {
            friendUid: uid,
            sourceId: 71,
            doLikeCount: count,
            doLikeTollCount: 0,
          },
        },
        null,
      ],
    })
  }

  static async handleFriendRequest(flag: string, accept: boolean) {
    const data = flag.split('|')
    if (data.length < 2) {
      return
    }
    const friendUid = data[0]
    const reqTime = data[1]
    const session = getSession()
    return session?.getBuddyService().approvalFriendRequest({
      friendUid,
      reqTime,
      accept
    })
  }

  static async getBuddyV2(refresh = false): Promise<FriendV2[]> {
    const uids: string[] = []
    const session = getSession()
    const buddyService = session?.getBuddyService()
    const buddyListV2 = refresh ? await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL) : await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL)
    uids.push(...buddyListV2?.data.flatMap(item => item.buddyUids)!)
    const data = await NTEventDispatch.CallNoListenerEvent<NodeIKernelProfileService['getCoreAndBaseInfo']>(
      'NodeIKernelProfileService/getCoreAndBaseInfo', 5000, 'nodeStore', uids
    )
    return Array.from(data.values())
  }

  @CacheClassFuncAsyncExtend(3600 * 1000, 'getBuddyIdMap', () => true)
  static async getBuddyIdMapCache(refresh = false): Promise<LimitedHashTable<string, string>> {
    return await NTQQFriendApi.getBuddyIdMap(refresh)
  }

  static async getBuddyIdMap(refresh = false): Promise<LimitedHashTable<string, string>> {
    const uids: string[] = []
    const retMap: LimitedHashTable<string, string> = new LimitedHashTable<string, string>(5000)
    const session = getSession()
    const buddyService = session?.getBuddyService()
    const buddyListV2 = refresh ? await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL) : await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL)
    uids.push(...buddyListV2?.data.flatMap(item => item.buddyUids)!)
    const data = await NTEventDispatch.CallNoListenerEvent<NodeIKernelProfileService['getCoreAndBaseInfo']>(
      'NodeIKernelProfileService/getCoreAndBaseInfo', 5000, 'nodeStore', uids
    );
    data.forEach((value, key) => {
      retMap.set(value.uin!, value.uid!)
    })
    //console.log('getBuddyIdMap', retMap.getValue)
    return retMap
  }

  static async getBuddyV2ExWithCate(refresh = false) {
    const uids: string[] = []
    const categoryMap: Map<string, any> = new Map()
    const session = getSession()
    const buddyService = session?.getBuddyService()
    const buddyListV2 = refresh ? (await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL))?.data : (await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL))?.data
    uids.push(
      ...buddyListV2?.flatMap(item => {
        item.buddyUids.forEach(uid => {
          categoryMap.set(uid, { categoryId: item.categoryId, categroyName: item.categroyName })
        })
        return item.buddyUids
      })!)
    const data = await NTEventDispatch.CallNoListenerEvent<NodeIKernelProfileService['getCoreAndBaseInfo']>(
      'NodeIKernelProfileService/getCoreAndBaseInfo', 5000, 'nodeStore', uids
    )
    return Array.from(data).map(([key, value]) => {
      const category = categoryMap.get(key)
      return category ? { ...value, categoryId: category.categoryId, categroyName: category.categroyName } : value
    })
  }

  static async isBuddy(uid: string): Promise<boolean> {
    const session = getSession()
    return session?.getBuddyService().isBuddy(uid)!
  }
}
