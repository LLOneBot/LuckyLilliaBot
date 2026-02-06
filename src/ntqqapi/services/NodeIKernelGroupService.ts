import {
  GroupMember,
  GroupMemberRole,
  GroupNotifyType,
  GroupRequestOperateTypes,
  GroupMsgMask,
  PublishGroupBulletinReq,
  GroupInfoSource
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

  getUinByUids(uidList: string[]): Promise<{
    errCode: number
    errMsg: string
    uins: Map<string, string>
  }>

  getUidByUins(uinList: string[]): Promise<{
    errCode: number
    errMsg: string
    uids: Map<string, string>
  }>

  queryCachedEssenceMsg(key: { groupCode: string, msgSeq: number, msgRandom: number }): Promise<{
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

  createMemberListScene(groupCode: string, scene: string): string

  getNextMemberList(sceneId: string, lastId: undefined, num: number): Promise<{
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

  kickMember(groupCode: string, kickUids: string[], refuseForever: boolean, kickReason: string): Promise<{
    errCode: number
    errMsg: string
    resultList: { uid: string, result: number }[]
  }>

  modifyMemberRole(groupCode: string, uid: string, role: GroupMemberRole): Promise<GeneralCallResult>

  modifyMemberCardName(groupCode: string, uid: string, cardName: string): Promise<GeneralCallResult>

  modifyGroupName(groupCode: string, groupName: string, isConf: boolean): Promise<GeneralCallResult>

  quitGroup(groupCode: string): Promise<GeneralCallResult>

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

  publishGroupBulletin(groupCode: string, psKey: string, req: PublishGroupBulletinReq): Promise<GeneralCallResult>

  uploadGroupBulletinPic(groupCode: string, psKey: string, path: string): Promise<{
    errCode: number
    errMsg: string
    picInfo?: {
      id: string
      width: number
      height: number
    }
  }>

  getGroupRemainAtTimes(groupCode: string): Promise<{
    errCode: number
    errMsg: string
    atInfo: {
      canAtAll: boolean
      RemainAtAllCountForUin: number
      RemainAtAllCountForGroup: number
      atTimesMsg: string
      canNotAtAllMsg: string
    }
  }>

  setGroupShutUp(groupCode: string, shutUp: boolean): Promise<GeneralCallResult>

  setMemberShutUp(groupCode: string, memberTimes: { uid: string, timeStamp: number }[]): Promise<GeneralCallResult>

  getGroupRecommendContactArkJson(groupCode: string): Promise<GeneralCallResult & { arkJson: string }>

  addGroupEssence(req: { groupCode: string, msgRandom: number, msgSeq: number }): Promise<{
    errCode: number
    errMsg: string
    result: {
      wording: string
      digestUin: string
      digestTime: number
      msg: {
        groupCode: string
        msgSeq: number
        msgRandom: number
        msgContent: unknown[]
        textSize: string
        picSize: string
        videoSize: string
        senderUin: string
        senderTime: number
        addDigestUin: string
        addDigestTime: number
        startTime: number
        latestMsgSeq: number
        opType: number
      },
      errorCode: number
    }
  }>

  removeGroupEssence(req: { groupCode: string, msgSeq: number, msgRandom: number }): Promise<{
    errCode: number
    errMsg: string
    result: {
      wording: string
      digestUin: string
      digestTime: number
      msg: {
        groupCode: string
        msgSeq: number
        msgRandom: number
        msgContent: unknown[]
        textSize: string
        picSize: string
        videoSize: string
        senderUin: string
        senderTime: number
        addDigestUin: string
        addDigestTime: number
        startTime: number
        latestMsgSeq: number
        opType: number
      },
      errorCode: number
    }
  }>

  setHeader(path: string, groupCode: string): Promise<GeneralCallResult>

  searchMember(sceneId: string, keyword: string): Promise<void>

  getGroupNotifiesUnreadCount(doubt: boolean): Promise<GeneralCallResult>

  getGroupArkInviteState(groupCode: string, ark_seq: string, invitedUin: string): Promise<GeneralCallResult>

  getGroupShutUpMemberList(groupCode: string): Promise<void | GeneralCallResult>

  getAllMemberList(groupCode: string, forceFetch: boolean): Promise<{
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

  setGroupMsgMask(groupCode: string, msgMask: GroupMsgMask): Promise<GeneralCallResult>

  deleteGroupBulletin(groupCode: string, psKey: string, feedsId: string): Promise<GeneralCallResult>

  modifyGroupRemark(groupCode: string, groupRemark: string): Promise<GeneralCallResult>

  checkGroupMemberCache(groupCodes: string[]): Promise<{
    errCode: number
    errMsg: string
    cacheResult: {
      datas: Map<string, boolean>
    }
  }>

  getGroupAllInfo(groupCode: string, source: GroupInfoSource): Promise<GeneralCallResult>

  setTop(groupCode: string, isTop: boolean): Promise<GeneralCallResult>

  getGroupDetailInfo(groupCode: string, source: GroupInfoSource): Promise<GeneralCallResult>
}
