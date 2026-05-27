export interface GroupJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  notificationSeq: bigint
  isDoubt: boolean
  comment: string
}

export interface GroupInvitedJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  targetUserUid: string
  notificationSeq: bigint
}

export interface GroupInvitationEvent {
  groupCode: number
  initiatorUid: string
  invitationSeq: bigint
  sourceGroupCode?: number
}
