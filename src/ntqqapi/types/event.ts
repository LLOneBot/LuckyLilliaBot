import { ChatType } from './msg'

export interface GroupJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  initiatorUin: number
  notificationSeq: bigint
  isDoubt: boolean
  comment: string
}

export interface GroupInvitedJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  initiatorUin: number
  targetUserUid: string
  targetUserUin: number
  notificationSeq: bigint
}

export interface GroupInvitationEvent {
  groupCode: number
  initiatorUid: string
  initiatorUin: number
  invitationSeq: bigint
  sourceGroupCode?: number
}

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
