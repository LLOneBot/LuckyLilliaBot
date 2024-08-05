import { Friend, FriendRequest, FriendV2 } from '../types'
import { ReceiveCmdS } from '../hook'
import { callNTQQApi, GeneralCallResult, NTQQApiMethod } from '../ntcall'
import { friendRequests } from '../../common/data'
import { wrapperApi } from '@/ntqqapi/wrapper'
import { BuddyListReqType, NodeIKernelProfileService } from '../services'
import { NTEventDispatch } from '../../common/utils/EventTask'

export class NTQQFriendApi {
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
    const request: FriendRequest = friendRequests[flag]
    if (!request) {
      throw `flat: ${flag}, 对应的好友请求不存在`
    }
    const result = await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.HANDLE_FRIEND_REQUEST,
      args: [
        {
          approvalInfo: {
            friendUid: request.friendUid,
            reqTime: request.reqTime,
            accept,
          },
        },
      ],
    })
    delete friendRequests[flag]
    return result
  }

  static async getBuddyV2(refresh = false): Promise<FriendV2[]> {
    const uids: string[] = []
    const session = wrapperApi.NodeIQQNTWrapperSession
    const buddyService = session.getBuddyService()
    const buddyListV2 = refresh ? await buddyService.getBuddyListV2('0', BuddyListReqType.KNOMAL) : await buddyService.getBuddyListV2('0', BuddyListReqType.KNOMAL)
    uids.push(...buddyListV2.data.flatMap(item => item.buddyUids))
    const data = await NTEventDispatch.CallNoListenerEvent<NodeIKernelProfileService['getCoreAndBaseInfo']>(
      'NodeIKernelProfileService/getCoreAndBaseInfo', 5000, 'nodeStore', uids
    )
    return Array.from(data.values())
  }
}
