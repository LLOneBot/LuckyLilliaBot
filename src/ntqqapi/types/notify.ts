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
  group: { groupCode: string, groupName: string }
  user1: { uid: string, nickName: string } // 入群请求发起者、被设置管理员的人、主动退群者
  user2: { uid: string, nickName: string } // 入群请求邀请者、设置管理员操作者、群成员被移除操作者
  actionUser: { uid: string, nickName: string } // 入群请求操作者
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
  MeInitiator,
  PeerInitiator,
  MeAgreed,
  MeAgreedAndAdded,
  PeerAgreed,
  PeerAgreedAndAdded,
  PeerRefused,
  MeRefused,
  MeIgnored,
  MeAgreeAnyone,
  MeSetQuestion,
  MeAgreeAndAddFailed,
  MsgInfo,
  MeInitiatorWaitPeerConfirm,
}

export interface FriendRequest {
  isDecide: boolean
  isInitiator: boolean
  friendUid: string
  reqType: BuddyReqType
  reqSubType: number
  reqTime: string
  extWords: string
  flag: number
  preGroupingId: number
  commFriendNum: number
  curFriendMax: number
  isShowCard: boolean
  isUnread: boolean
  isDoubt: boolean
  nameMore: string
  friendNick: string
  friendAvatarUrl: string
  sourceId: number
  groupCode: string
  isBuddy: boolean | null
  isAgreed: boolean
  relation: number
}

export interface FriendRequestNotify {
  unreadNums: number
  buddyReqs: FriendRequest[]
}
