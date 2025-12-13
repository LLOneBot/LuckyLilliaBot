import { SimpleInfo } from '../types'
import { invoke, NTMethod } from '../ntcall'
import { Context, Service } from 'cordis'
import { GeneralCallResult } from '../services'

declare module 'cordis' {
  interface Context {
    ntFriendApi: NTQQFriendApi
  }
}

export class NTQQFriendApi extends Service {
  static inject = ['ntUserApi', 'ntSystemApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntFriendApi', true)
  }

  /** reqTime 可为 0 */
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
    return data
  }

  async getBuddyV2(forceRefresh: boolean) {
    const deviceInfo = await this.ctx.ntSystemApi.getDeviceInfo()
    const version = +deviceInfo.buildVer.split('-')[1]
    if (version >= 41679) {
      return await invoke('nodeIKernelBuddyService/getBuddyListV2', ['', forceRefresh, 0])
    } else {
      return await invoke<GeneralCallResult & {
        data: {
          categoryId: number
          categorySortId: number
          categroyName: string
          categroyMbCount: number
          onlineCount: number
          buddyUids: string[]
        }[]
      }>('nodeIKernelBuddyService/getBuddyListV2', [forceRefresh, 0])
    }
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

  async clearBuddyReqUnreadCnt() {
    return await invoke('nodeIKernelBuddyService/clearBuddyReqUnreadCnt', [])
  }

  async getDoubtBuddyReq(reqNum: number) {
    const reqId = Date.now().toString()
    return await invoke(
      'nodeIKernelBuddyService/getDoubtBuddyReq',
      [reqId, reqNum, ''],
      {
        resultCmd: 'nodeIKernelBuddyListener/onDoubtBuddyReqChange',
        resultCb: payload => payload.reqId === reqId
      }
    )
  }

  async approvalDoubtBuddyReq(uid: string) {
    return await invoke('nodeIKernelBuddyService/approvalDoubtBuddyReq', [uid, '', ''])
  }

  async getBuddyReq() {
    return await invoke(
      'nodeIKernelBuddyService/getBuddyReq',
      [],
      {
        resultCmd: 'nodeIKernelBuddyListener/onBuddyReqChange'
      }
    )
  }

  async getCategoryById(categoryId: number) {
    return await invoke('nodeIKernelBuddyService/getCategoryById', [categoryId])
  }
}
