export enum FriendReqType {
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
