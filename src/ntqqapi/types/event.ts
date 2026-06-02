import { ChatType, RawMessage } from './msg'

/** 消息接收事件 */
export interface MessageCreatedEvent {
  message: RawMessage
}

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

/** 消息发送事件 */
export interface MessageSentEvent {
  message: RawMessage
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

/** 群管理员变更事件 */
export interface GroupAdminChangedEvent {
  groupCode: number
  targetUin: number
  targetUid: string
  operatorUin: number
  operatorUid: string
  isSet: boolean
}

/** 群消息表情回应事件 */
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

/** 群精华消息变更事件 */
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

/** 主页赞事件 */
export interface ProfileLikeEvent {
  uin: number
  uid: string
  nick: string
  times: number
}

/** 好友或群聊置顶状态变更事件 */
export interface PinChangedEvent {
  chatType: ChatType
  peerUin: number
  peerUid: string
  isPinned: boolean
}

/** 语音转写结果事件 */
export interface PttTransResultEvent {
  msgId: string
  text: string
}

/** 自身被踢下线事件 */
export interface KickedOfflineEvent {
  tipsDesc: string
  tipsTitle: string
  kickedType: number
}

/** 自身在线状态变更事件 */
export interface StatusChangedEvent {
  status: number
}
