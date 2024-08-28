import { Friend, FriendV2, SimpleInfo, CategoryFriend } from '../types'
import { ReceiveCmdS } from '../hook'
import { invoke, NTMethod, NTClass } from '../ntcall'
import { getSession } from '@/ntqqapi/wrapper'
import { BuddyListReqType, NodeIKernelProfileService } from '../services'
import { NTEventDispatch } from '@/common/utils/eventTask'
import { LimitedHashTable } from '@/common/utils/table'
import { pick } from 'cosmokit'
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

  /** 大于或等于 26702 应使用 getBuddyV2 */
  async getFriends(forced = false) {
    const data = await invoke<{
      data: {
        categoryId: number
        categroyName: string
        categroyMbCount: number
        buddyList: Friend[]
      }[]
    }>({
      className: NTClass.NODE_STORE_API,
      methodName: 'getBuddyList',
      cbCmd: ReceiveCmdS.FRIENDS,
      afterFirstCmd: false,
    })
    const _friends: Friend[] = []
    for (const item of data.data) {
      _friends.push(...item.buddyList)
    }
    return _friends
  }

  async handleFriendRequest(flag: string, accept: boolean) {
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

  async getBuddyV2(refresh = false): Promise<FriendV2[]> {
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
        userSimpleInfos: Record<string, SimpleInfo>
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getBuddyList',
        args: [refresh],
        cbCmd: ReceiveCmdS.FRIENDS,
        afterFirstCmd: false,
      })
      const categoryUids: Map<number, string[]> = new Map()
      for (const item of data.buddyCategory) {
        categoryUids.set(item.categoryId, item.buddyUids)
      }
      return Object.values(data.userSimpleInfos).filter(v => v.baseInfo && categoryUids.get(v.baseInfo.categoryId)?.includes(v.uid!))
    }
  }

  async getBuddyIdMap(refresh = false): Promise<LimitedHashTable<string, string>> {
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
        userSimpleInfos: Record<string, SimpleInfo>
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getBuddyList',
        args: [refresh],
        cbCmd: ReceiveCmdS.FRIENDS,
        afterFirstCmd: false,
      })
      for (const item of Object.values(data.userSimpleInfos)) {
        retMap.set(item.uin!, item.uid!)
      }
    }
    return retMap
  }

  async getBuddyV2ExWithCate(refresh = false) {
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
        userSimpleInfos: Record<string, SimpleInfo>
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getBuddyList',
        args: [refresh],
        cbCmd: ReceiveCmdS.FRIENDS,
        afterFirstCmd: false,
      })
      const category: Map<number, Pick<CategoryFriend, 'buddyUids' | 'categroyName'>> = new Map()
      for (const item of data.buddyCategory) {
        category.set(item.categoryId, pick(item, ['buddyUids', 'categroyName']))
      }
      return Object.values(data.userSimpleInfos)
        .filter(v => v.baseInfo && category.get(v.baseInfo.categoryId)?.buddyUids.includes(v.uid!))
        .map(value => {
          return {
            ...value,
            categoryId: value.baseInfo.categoryId,
            categroyName: category.get(value.baseInfo.categoryId)?.categroyName
          }
        })
    }
  }

  async isBuddy(uid: string): Promise<boolean> {
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
