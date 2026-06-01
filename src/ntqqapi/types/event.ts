import { ChatType } from './msg'

/** 消息撤回事件 */
export interface MessageDeleteEvent {
  chatType: ChatType
  peerUin: number
  peerUid: string
  msgId: string
  msgSeq: number
  msgRandom: number
  senderUin: number
  senderUid: string
  operatorUin: number
  operatorUid: string
  displaySuffix: string
}

/** 入群请求事件 */
export interface GroupJoinRequestEvent {
  groupCode: number
  initiatorUin: number
  initiatorUid: string
  notificationSeq: bigint
  isDoubt: boolean
  comment: string
}

/** 群成员邀请他人入群请求事件 */
export interface GroupInvitedJoinRequestEvent {
  groupCode: number
  initiatorUin: number
  initiatorUid: string
  targetUserUin: number
  targetUserUid: string
  notificationSeq: bigint
}

/** 他人邀请自身入群事件 */
export interface GroupInvitationEvent {
  groupCode: number
  initiatorUin: number
  initiatorUid: string
  invitationSeq: bigint
  sourceGroupCode?: number
}

/** 群添加事件 */
export interface GroupAddedEvent {
  groupCode: number
}

/** 群移除事件 */
export interface GroupRemovedEvent {
  groupCode: number
}

/** 群解散事件 */
export interface GroupDisbandEvent {
  groupCode: number
  operatorUin: number
  operatorUid: string
}

/** 群戳一戳事件 */
export interface GroupNudgeEvent {
  groupCode: number
  senderUin: number
  senderUid: string
  receiverUin: number
  receiverUid: string
  displayAction: string
  displaySuffix: string
  displayActionImgUrl: string
}

/** 群名称变更事件 */
export interface GroupNameChangedEvent {
  groupCode: number
  newGroupName: string
  operatorUin: number
  operatorUid: string
}

/** 群全体禁言事件 */
export interface GroupWholeMuteEvent {
  groupCode: number
  operatorUin: number
  operatorUid: string
  isMute: boolean
}

/** 群禁言事件 */
export interface GroupMuteEvent {
  groupCode: number
  memberUin: number
  memberUid: string
  operatorUin: number
  operatorUid: string
  duration: number
}

/** 群成员增加事件 */
export interface GroupMemberAddedEvent {
  groupCode: number
  memberUin: number
  memberUid: string
  operatorUin?: number
  operatorUid?: string
  invitorUin?: number
  invitorUid?: string
}

/** 群成员减少事件 */
export interface GroupMemberRemovedEvent {
  groupCode: number
  memberUin: number
  memberUid: string
  operatorUin?: number
  operatorUid?: string
}

/** 群成员名片变更事件 */
export interface GroupMemberCardNameChangedEvent {
  groupCode: number
  uin: number
  uid: string
  oldCardName: string
  newCardName: string
}

/** 群专属头衔变更事件 */
export interface GroupMemberSpecialTitleChangedEvent {
  groupCode: number
  uin: number
  uid: string
  newSpecialTitle: string
}

/** 好友请求事件 */
export interface FriendRequestEvent {
  initiatorUin: number
  initiatorUid: string
  comment: string
  via: string
}

/** 好友添加事件 */
export interface FriendAddedEvent {
  uin: number
  uid: string
}

/** 好友移除事件 */
export interface FriendRemovedEvent {
  uin: number
  uid: string
}

/** 好友戳一戳事件 */
export interface FriendNudgeEvent {
  uin: number
  uid: string
  isSelfSend: boolean
  isSelfReceive: boolean
  displayAction: string
  displaySuffix: string
  displayActionImgUrl: string
}
