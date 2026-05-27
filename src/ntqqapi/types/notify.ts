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
  /** 该字段从 9.9.26-44498 开始存在 */
  addSource: string
  sourceFlag: number
}

export interface FriendRequestNotify {
  unreadNums: number
  buddyReqs: FriendRequest[]
}

export enum GroupNotificationType {
  JoinRequest,
  AdminChange,
  Kick,
  Quit,
  InvitedJoinRequest,
  Invitation
}

export enum RequestState {
  Init, // 初始化
  Unhandle, // 未处理
  Agreed, // 同意
  Refused, // 拒绝
  Ignored // 忽略
}

export interface GroupJoinRequest {
  notificationType: GroupNotificationType.JoinRequest
  groupCode: number
  groupName: string
  notificationSeq: number
  initiatorUid: string
  initiatorNick: string
  state: RequestState
  operatorUid?: string
  operatorNick?: string
  comment: string
}

export interface GroupAdminChange {
  notificationType: GroupNotificationType.AdminChange
  groupCode: number
  groupName: string
  notificationSeq: number
  targetUserUid: string
  targetUserNick: string
  isSet: boolean
  operatorUid: string
  operatorNick: string
}

export interface GroupKick {
  notificationType: GroupNotificationType.Kick
  groupCode: number
  groupName: string
  notificationSeq: number
  targetUserUid: string
  targetUserNick: string
  operatorUid: string
  operatorNick: string
}

export interface GroupQuit {
  notificationType: GroupNotificationType.Quit
  groupCode: number
  groupName: string
  notificationSeq: number
  targetUserUid: string
  targetUserNick: string
}

export interface GroupInvitedJoinRequest {
  notificationType: GroupNotificationType.InvitedJoinRequest
  groupCode: number
  groupName: string
  notificationSeq: number
  initiatorUid: string
  initiatorNick: string
  targetUserUid: string
  targetUserNick: string
  state: RequestState
  operatorUid?: string
  operatorNick?: string
}

export interface GroupInvitation {
  notificationType: GroupNotificationType.Invitation
  groupCode: number
  groupName: string
  notificationSeq: number
  initiatorUid: string
  initiatorNick: string
  state: RequestState
  sourceGroupCode: number
  operatorUid?: string
  operatorNick?: string
}

export type GroupNotification =
  | GroupJoinRequest
  | GroupAdminChange
  | GroupKick
  | GroupQuit
  | GroupInvitedJoinRequest
  | GroupInvitation
