import { SimpleInfo } from '../types'
import { NTMethod } from '../ntcall'
import { Context, Service } from 'cordis'
import { GeneralCallResult } from '../services'

declare module 'cordis' {
  interface Context {
    ntFriendApi: NTQQFriendApi
  }
}

export class NTQQFriendApi extends Service {
  static inject = ['ntUserApi', 'ntSystemApi', 'pmhq']

  constructor(protected ctx: Context) {
    super(ctx, 'ntFriendApi')
  }

  /** reqTime 可为 0 */
  async handleFriendRequest(friendUid: string, reqTime: string, accept: boolean) {
    return await this.ctx.pmhq.invoke(NTMethod.HANDLE_FRIEND_REQUEST, [{
      friendUid,
      reqTime,
      accept,
    },
    ])
  }

  async getBuddyList(): Promise<SimpleInfo[]> {
    const data = await this.ctx.pmhq.invoke<SimpleInfo[]>(
      'getBuddyList',
      [],
      {},
    )
    return data
  }

  async getBuddyV2(forceRefresh: boolean) {
    const deviceInfo = await this.ctx.ntSystemApi.getDeviceInfo()
    const version = +deviceInfo.buildVer.split('-')[1]
    let result
    if (version >= 41679) {
      result = await this.ctx.pmhq.invoke('nodeIKernelBuddyService/getBuddyListV2', ['', forceRefresh, 0])
    } else {
      result = await this.ctx.pmhq.invoke<GeneralCallResult & {
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

    return result
  }

  async isBuddy(uid: string): Promise<boolean> {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/isBuddy', [uid])
  }

  async getBuddyRecommendContact(uin: string) {
    const ret = await this.ctx.pmhq.invoke('nodeIKernelBuddyService/getBuddyRecommendContactArkJson', [uin, '-'])
    return ret.arkMsg
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

  async approvalDoubtBuddyReq(uid: string) {
    return await this.ctx.pmhq.invoke('nodeIKernelBuddyService/approvalDoubtBuddyReq', [uid, '', ''])
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
