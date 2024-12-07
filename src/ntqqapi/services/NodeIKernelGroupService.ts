import {
  GroupMember,
  GroupMemberRole,
  GroupNotifyType,
  GroupRequestOperateTypes,
} from '@/ntqqapi/types'
import { GeneralCallResult } from './common'

export interface NodeIKernelGroupService {
  getGroupHonorList(req: { groupCode: number[] }): Promise<{
    errCode: number
    errMsg: string
    groupMemberHonorList: {
      honorList: {
        groupCode: string
        id: number[]
        isGray: number
      }[]
      cacheTs: number
      honorInfos: unknown[]
      joinTime: number
    }
  }>

  getUinByUids(uins: string[]): Promise<{
    errCode: number
    errMsg: string
    uins: Map<string, string>
  }>

  getUidByUins(uins: string[]): Promise<{
    errCode: number
    errMsg: string
    uids: Map<string, string>
  }>

  queryCachedEssenceMsg(req: { groupCode: string, msgRandom: number, msgSeq: number }): Promise<{
    items: {
      groupCode: string
      msgSeq: number
      msgRandom: number
      msgSenderUin: string
      msgSenderNick: string
      opType: number
      opUin: string
      opNick: string
      opTime: number
      grayTipSeq: string
    }[]
  }>

  setHeader(uid: string, path: string): unknown

  createMemberListScene(groupCode: string, scene: string): string

  getNextMemberList(sceneId: string, a: undefined, num: number): Promise<{
    errCode: number
    errMsg: string
    result: {
      ids: {
        uid: string
        index: number
      }[]
      infos: Map<string, GroupMember>
      finish: boolean
      hasRobot: boolean
    }
  }>

  kickMember(groupCode: string, memberUids: string[], refuseForever: boolean, kickReason: string): Promise<void>

  modifyMemberRole(groupCode: string, uid: string, role: GroupMemberRole): void

  modifyMemberCardName(groupCode: string, uid: string, cardName: string): void

  modifyGroupName(groupCode: string, groupName: string, arg: false): void

  quitGroup(groupCode: string): void

  getSingleScreenNotifies(force: boolean, startSeq: string, num: number): Promise<GeneralCallResult>

  operateSysNotify(
    doubt: boolean,
    operateMsg: {
      operateType: GroupRequestOperateTypes // 2 拒绝
      targetMsg: {
        seq: string  // 通知序列号
        type: GroupNotifyType
        groupCode: string
        postscript: string
      }
    }
  ): Promise<GeneralCallResult>

  publishGroupBulletin(groupCode: string, pskey: string, data: unknown): Promise<GeneralCallResult>

  uploadGroupBulletinPic(groupCode: string, pskey: string, imagePath: string): Promise<{
    errCode: number
    errMsg: string
    picInfo?: {
      id: string
      width: number
      height: number
    }
  }>

  getGroupRemainAtTimes(groupCode: string): Promise<GeneralCallResult & {
    atInfo: {
      canAtAll: boolean
      RemainAtAllCountForUin: number
      RemainAtAllCountForGroup: number
      atTimesMsg: string
      canNotAtAllMsg: ''
    }
  }>

  setGroupShutUp(groupCode: string, shutUp: boolean): void

  setMemberShutUp(groupCode: string, memberTimes: { uid: string, timeStamp: number }[]): Promise<void>

  getGroupRecommendContactArkJson(groupCode: string): Promise<GeneralCallResult & { arkJson: string }>

  addGroupEssence(param: { groupCode: string, msgRandom: number, msgSeq: number }): Promise<unknown>

  removeGroupEssence(param: { groupCode: string, msgRandom: number, msgSeq: number }): Promise<unknown>

  setHeader(args: unknown[]): Promise<GeneralCallResult>

  searchMember(sceneId: string, keyword: string): Promise<void>

  getGroupNotifiesUnreadCount(doubt: boolean): Promise<GeneralCallResult>
}
