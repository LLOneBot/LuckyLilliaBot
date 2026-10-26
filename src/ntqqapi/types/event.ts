import { ChatType, RawMessage } from './msg'

export interface MessageCreatedEvent {
  message: RawMessage
}

export interface MessageDeletedEvent {
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

export interface MessageSentEvent {
  message: RawMessage
}

export interface GroupJoinRequestEvent {
  groupCode: number
  initiatorUin: number
  initiatorUid: string
  notificationSeq: number
  isDoubt: boolean
  comment: string
}

/** 群成员邀请别人入群 */
export interface GroupInvitedJoinRequestEvent {
  groupCode: number
  initiatorUin: number
  initiatorUid: string
  targetUserUin: number
  targetUserUid: string
  notificationSeq: number
}

/** 别人邀请自己入群 */
export interface GroupInvitationEvent {
  groupCode: number
  initiatorUin: number
  initiatorUid: string
  invitationSeq: number
  sourceGroupCode?: number
}

export interface GroupAddedEvent {
  groupCode: number
}

export interface GroupRemovedEvent {
  groupCode: number
}

export interface GroupDisbandEvent {
  groupCode: number
  operatorUin: number
  operatorUid: string
}

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

export interface GroupNameChangedEvent {
  groupCode: number
  newGroupName: string
  operatorUin: number
  operatorUid: string
}

export interface GroupAdminChangedEvent {
  groupCode: number
  targetUin: number
  targetUid: string
  operatorUin: number
  operatorUid: string
  isSet: boolean
}

export interface GroupMessageReactionEvent {
  groupCode: number
  operatorUin: number
  operatorUid: string
  msgSeq: number
  faceId: string
  count: number
  type: number
  isAdd: boolean
}

export interface GroupEssenceMessageChangedEvent {
  groupCode: number
  msgId: string
  msgSeq: number
  msgRandom: number
  senderUin: number
  senderUid: string
  operatorUin: number
  operatorUid: string
  isSet: boolean
}

export interface GroupWholeMuteEvent {
  groupCode: number
  operatorUin: number
  operatorUid: string
  isMute: boolean
}

export interface GroupMuteEvent {
  groupCode: number
  memberUin: number
  memberUid: string
  operatorUin: number
  operatorUid: string
  duration: number
}

export interface GroupMemberAddedEvent {
  groupCode: number
  memberUin: number
  memberUid: string
  operatorUin?: number
  operatorUid?: string
  invitorUin?: number
  invitorUid?: string
}

export interface GroupMemberRemovedEvent {
  groupCode: number
  memberUin: number
  memberUid: string
  operatorUin?: number
  operatorUid?: string
}

export interface GroupMemberCardNameChangedEvent {
  groupCode: number
  uin: number
  uid: string
  oldCardName: string
  newCardName: string
}

export interface GroupMemberSpecialTitleChangedEvent {
  groupCode: number
  uin: number
  uid: string
  newSpecialTitle: string
}

export interface FriendRequestEvent {
  initiatorUin: number
  initiatorUid: string
  comment: string
  via: string
}

export interface FriendAddedEvent {
  uin: number
  uid: string
}

export interface FriendRemovedEvent {
  uin: number
  uid: string
}

export interface FriendNudgeEvent {
  uin: number
  uid: string
  isSelfSend: boolean
  isSelfReceive: boolean
  displayAction: string
  displaySuffix: string
  displayActionImgUrl: string
}

export interface ProfileLikeEvent {
  uin: number
  uid: string
  nick: string
  times: number
}

/** 好友或群聊的置顶 */
export interface PinChangedEvent {
  chatType: ChatType
  peerUin: number
  peerUid: string
  isPinned: boolean
}

export interface PttTransResultEvent {
  msgId: string
  text: string
}

export interface KickedOfflineEvent {
  tipsDesc: string
  tipsTitle: string
  kickedType: number
}

export interface StatusChangedEvent {
  status: number
}
