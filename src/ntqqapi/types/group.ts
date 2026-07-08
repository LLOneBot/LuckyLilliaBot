export enum GroupMsgMask {
  AllowNotify = 1,  // 允许提醒
  AllowNotNotify = 4,  // 接受消息不提醒
  BoxNotNotify = 2,  // 收进群助手不提醒
  NotAllow = 3,  // 屏蔽
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
  memberRole: GroupMemberRole
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
