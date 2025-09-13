import { BuddyListReqType } from '@/ntqqapi/types'
import { GeneralCallResult } from './common'

export interface NodeIKernelBuddyService {
  getBuddyListV2(refresh: boolean, reqType: BuddyListReqType): Promise<GeneralCallResult & {
    data: {
      categoryId: number
      categorySortId: number
      categroyName: string
      categroyMbCount: number
      onlineCount: number
      buddyUids: string[]
    }[]
  }>

  setBuddyRemark(remarkParams: { uid: string, remark: string }): Promise<GeneralCallResult>

  isBuddy(uid: string): boolean

  approvalFriendRequest(approvalInfo: {
    friendUid: string
    reqTime: string
    accept: boolean
  }): Promise<void>

  getBuddyRecommendContactArkJson(uid: string, phoneNumber: string): Promise<GeneralCallResult & { arkMsg: string }>

  delBuddy(delInfo: {
    friendUid: string
    tempBlock: boolean
    tempBothDel: boolean
  }): Promise<GeneralCallResult>

  clearBuddyReqUnreadCnt(): Promise<GeneralCallResult>

  setBuddyCategory(uid: string, categoryId: number): Promise<GeneralCallResult>
}
