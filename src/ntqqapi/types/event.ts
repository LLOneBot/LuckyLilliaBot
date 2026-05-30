import { ChatType } from './msg'

/** 入群请求事件 */
export interface GroupJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  initiatorUin: number
  notificationSeq: bigint
  isDoubt: boolean
  comment: string
}

/** 群成员邀请他人入群请求事件 */
export interface GroupInvitedJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  initiatorUin: number
  targetUserUid: string
  targetUserUin: number
  notificationSeq: bigint
}

/** 他人邀请自身入群事件 */
export interface GroupInvitationEvent {
  groupCode: number
  initiatorUid: string
  initiatorUin: number
  invitationSeq: bigint
  sourceGroupCode?: number
}

/** 消息撤回事件 */
export interface MessageDeleteEvent {
  chatType: ChatType
  peerUid: string
  peerUin: number
  msgId: string
  msgSeq: number
  msgRandom: number
  senderUid: string
  senderUin: number
  operatorUid: string
  operatorUin: number
  displaySuffix: string
}

/** 群添加事件 */
export interface GroupAddedEvent {
  groupCode: number
}

/** 群移除事件 */
export interface GroupRemovedEvent {
  groupCode: number
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
