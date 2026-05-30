export enum GroupMsgMask {
  AllowNotify = 1,  // 允许提醒
  AllowNotNotify = 4,  // 接受消息不提醒
  BoxNotNotify = 2,  // 收进群助手不提醒
  NotAllow = 3,  // 屏蔽
}

// TODO: 是否保留
export enum LocalExitGroupReason {
  NO_QUIT = 0,  // 没有退出群，正常状态
  KICKED = 1,  // 被踢出
  DISMISS = 2,  // 群解散
  SELF_QUIT = 3  // 自己主动退出
}

export interface Group {
  groupCode: number
  groupName: string
  ownerUid: string
  createdAt: number
  maxMemberCount: number
  memberCount: number
  description: string
  question: string
  announcementPreview: string
  remark: string
  isPin: boolean
  groupShutupExpireTime: number
  personShutupExpireTime: number
}

export enum GroupMemberRole {
  Normal = 0,
  Admin = 2,
  Owner = 1
}

export interface GroupMember {
  uin: number
  uid: string
  nick: string
  cardName: string
  specialTitle: string
  level: number
  joinedAt: number
  lastSpokeAt: number
  shutupExpireTime: number
  role: GroupMemberRole
}
