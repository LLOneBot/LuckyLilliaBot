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
  JoinRequest = 1,
  Invitation = 2,
  SetAdmin = 3,
  Kick = 6,
  Quit = 13,
  UnsetAdmin = 16,
  InvitedJoinRequest = 22
}

export enum RequestState {
  Init, // 初始化
  Unhandle, // 未处理
  Agreed, // 同意
  Refused, // 拒绝
  Ignored // 忽略
}
