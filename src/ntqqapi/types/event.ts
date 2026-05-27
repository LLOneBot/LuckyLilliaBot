export interface GroupJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  notificationSeq: number
  isDoubt: boolean
  comment: string
}

export interface GroupInvitedJoinRequestEvent {
  groupCode: number
  initiatorUid: string
  targetUserUid: string
  notificationSeq: number
}

export interface GroupInvitationEvent {
  groupCode: number
  initiatorUid: string
  invitationSeq: number
  sourceGroupCode?: number
}
