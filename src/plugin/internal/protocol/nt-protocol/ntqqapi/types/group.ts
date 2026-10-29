export enum GroupMsgMask {
  /** 允许提醒 */
  AllowNotify = 1,
  /** 接受消息不提醒 */
  AllowNotNotify = 4,
  /** 收进群助手不提醒 */
  BoxNotNotify = 2,
  /** 屏蔽 */
  NotAllow = 3,
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
  msgMask: GroupMsgMask
}

export enum GroupMemberRole {
  NotApplicable = 0,
  Normal = 2,
  Admin = 3,
  Owner = 4
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
