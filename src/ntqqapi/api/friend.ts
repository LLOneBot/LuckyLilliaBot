import { Friend, FriendV2, SimpleInfo, CategoryFriend } from '../types'
import { ReceiveCmdS } from '../hook'
import { invoke, NTMethod, NTClass } from '../ntcall'
import { getSession } from '@/ntqqapi/wrapper'
import { BuddyListReqType, NodeIKernelProfileService } from '../services'
import { NTEventDispatch } from '@/common/utils/EventTask'
import { LimitedHashTable } from '@/common/utils/table'

export class NTQQFriendApi {
  /** 大于或等于 26702 应使用 getBuddyV2 */
  static async getFriends(forced = false) {
    const data = await invoke<{
      data: {
        categoryId: number
        categroyName: string
        categroyMbCount: number
        buddyList: Friend[]
      }[]
    }>({
      methodName: NTMethod.FRIENDS,
      args: [{ force_update: forced }, undefined],
      cbCmd: ReceiveCmdS.FRIENDS,
      afterFirstCmd: false,
    })
    let _friends: Friend[] = []
    for (const fData of data.data) {
      _friends.push(...fData.buddyList)
    }
    return _friends
  }

  static async handleFriendRequest(flag: string, accept: boolean) {
    const data = flag.split('|')
    if (data.length < 2) {
      return
    }
    const friendUid = data[0]
    const reqTime = data[1]
    const session = getSession()
    if (session) {
      return session.getBuddyService().approvalFriendRequest({
        friendUid,
        reqTime,
        accept
      })
    } else {
      return await invoke({
        methodName: NTMethod.HANDLE_FRIEND_REQUEST,
        args: [
          {
            approvalInfo: {
              friendUid,
              reqTime,
              accept,
            },
          },
        ],
      })
    }
  }

  static async getBuddyV2(refresh = false): Promise<FriendV2[]> {
    const session = getSession()
    if (session) {
      const uids: string[] = []
      const buddyService = session.getBuddyService()
      const buddyListV2 = await buddyService.getBuddyListV2('0', BuddyListReqType.KNOMAL)
      uids.push(...buddyListV2.data.flatMap(item => item.buddyUids))
      const data = await NTEventDispatch.CallNoListenerEvent<NodeIKernelProfileService['getCoreAndBaseInfo']>(
        'NodeIKernelProfileService/getCoreAndBaseInfo', 5000, 'nodeStore', uids
      )
      return Array.from(data.values())
    } else {
      const data = await invoke<{
        buddyCategory: CategoryFriend[]
        userSimpleInfos: Map<string, SimpleInfo>
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getBuddyList',
        args: [refresh],
        cbCmd: ReceiveCmdS.FRIENDS,
        afterFirstCmd: false,
      })
      return Array.from(data.userSimpleInfos.values())
    }
  }

  static async getBuddyIdMap(refresh = false): Promise<LimitedHashTable<string, string>> {
    const retMap: LimitedHashTable<string, string> = new LimitedHashTable<string, string>(5000)
    const session = getSession()
    if (session) {
      const uids: string[] = []
      const buddyService = session?.getBuddyService()
      const buddyListV2 = await buddyService.getBuddyListV2('0', BuddyListReqType.KNOMAL)
      uids.push(...buddyListV2.data.flatMap(item => item.buddyUids))
      const data = await NTEventDispatch.CallNoListenerEvent<NodeIKernelProfileService['getCoreAndBaseInfo']>(
        'NodeIKernelProfileService/getCoreAndBaseInfo', 5000, 'nodeStore', uids
      )
      data.forEach((value, key) => {
        retMap.set(value.uin!, value.uid!)
      })
    } else {
      const data = await invoke<{
        buddyCategory: CategoryFriend[]
        userSimpleInfos: Map<string, SimpleInfo>
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getBuddyList',
        args: [refresh],
        cbCmd: ReceiveCmdS.FRIENDS,
        afterFirstCmd: false,
      })
      data.userSimpleInfos.forEach((value, key) => {
        retMap.set(value.uin!, value.uid!)
      })
    }
    return retMap
  }

  static async getBuddyV2ExWithCate(refresh = false) {
    const session = getSession()
    if (session) {
      const uids: string[] = []
      const categoryMap: Map<string, any> = new Map()
      const buddyService = session.getBuddyService()
      const buddyListV2 = (await buddyService?.getBuddyListV2('0', BuddyListReqType.KNOMAL))?.data
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
    } else {
      const data = await invoke<{
        buddyCategory: CategoryFriend[]
        userSimpleInfos: Map<string, SimpleInfo>
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getBuddyList',
        args: [refresh],
        cbCmd: ReceiveCmdS.FRIENDS,
        afterFirstCmd: false,
      })
      return Array.from(data.userSimpleInfos).map(([key, value]) => {
        if (value.baseInfo) {
          return {
            ...value,
            categoryId: value.baseInfo.categoryId,
            categroyName: data.buddyCategory.find(e => e.categoryId === value.baseInfo.categoryId)?.categroyName
          }
        }
        return value
      })
    }
  }

  static async isBuddy(uid: string): Promise<boolean> {
    const session = getSession()
    if (session) {
      return session.getBuddyService().isBuddy(uid)
    } else {
      return await invoke<boolean>({
        methodName: 'nodeIKernelBuddyService/isBuddy',
        args: [
          { uid },
          null,
        ],
      })
    }
  }
}
