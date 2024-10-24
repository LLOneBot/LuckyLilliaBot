import { BuddyListReqType } from '@/ntqqapi/types'
import { GeneralCallResult } from './common'

export interface NodeIKernelBuddyService {
  getBuddyListV2(callFrom: string, reqType: BuddyListReqType): Promise<GeneralCallResult & {
    data: {
      categoryId: number
      categorySortId: number
      categroyName: string
      categroyMbCount: number
      onlineCount: number
      buddyUids: string[]
    }[]
  }>

  setBuddyRemark(arg: unknown): void

  isBuddy(uid: string): boolean

  approvalFriendRequest(arg: {
    friendUid: string
    reqTime: string
    accept: boolean
  }): Promise<void>

  getBuddyRecommendContactArkJson(uid: string, phoneNumber: string): Promise<GeneralCallResult & { arkMsg: string }>
}
