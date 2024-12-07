export enum GroupNotifyType {
  InvitedByMember = 1,
  RefuseInvited,
  RefusedByAdminiStrator,
  AgreedTojoinDirect, // 有人接受了邀请入群
  InvitedNeedAdminiStratorPass, // 有人邀请了别人入群
  AgreedToJoinByAdminiStrator,
  RequestJoinNeedAdminiStratorPass,
  SetAdmin,
  KickMemberNotifyAdmin,
  KickMemberNotifyKicked,
  MemberLeaveNotifyAdmin, // 主动退出
  CancelAdminNotifyCanceled, // 我被取消管理员
  CancelAdminNotifyAdmin, // 其他人取消管理员
  TransferGroupNotifyOldowner,
  TransferGroupNotifyAdmin
}

export interface GroupNotifies {
  doubt: boolean
  nextStartSeq: string
  notifies: GroupNotify[]
}

export enum GroupNotifyStatus {
  Init, // 初始化
  Unhandle, // 未处理
  Agreed, // 同意
  Refused, // 拒绝
  Ignored // 忽略
}

export interface GroupNotify {
  time: number // 自己添加的字段，时间戳，毫秒, 用于判断收到短时间内收到重复的notify
  seq: string // 唯一标识符，转成数字再除以1000应该就是时间戳？
  type: GroupNotifyType
  status: GroupNotifyStatus
  group: { groupCode: string; groupName: string }
  user1: { uid: string; nickName: string } // 被设置管理员的人
  user2: { uid: string; nickName: string } // 操作者
  actionUser: { uid: string; nickName: string } //未知
  actionTime: string
  invitationExt: {
    srcType: number // 0?未知
    groupCode: string
    waitStatus: number
  }
  postscript: string // 加群用户填写的验证信息
  repeatSeqs: []
  warningTips: string
}

export enum GroupRequestOperateTypes {
  Approve = 1,
  Reject = 2,
}

export enum BuddyReqType {
  MsgInfo = 12,
  MeInitiatorWaitPeerConfirm = 13,
}

export interface FriendRequest {
  isInitiator?: boolean
  isDecide: boolean
  friendUid: string
  reqType: BuddyReqType
  reqTime: string // 时间戳,秒
  extWords: string // 申请人填写的验证消息
  isUnread: boolean
  friendNick: string
  sourceId: number
  groupCode: string
}

export interface FriendRequestNotify {
  data: {
    unreadNums: number
    buddyReqs: FriendRequest[]
  }
}
