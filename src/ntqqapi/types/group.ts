export interface Group {
  groupCode: string
  maxMember: number
  memberCount: number
  groupName: string
  groupStatus: 0
  memberRole: 2
  isTop: boolean
  toppedTimestamp: '0'
  privilegeFlag: number //65760
  isConf: boolean
  hasModifyConfGroupFace: boolean
  hasModifyConfGroupName: boolean
  remarkName: string
  hasMemo: boolean
  groupShutupExpireTime: string
  personShutupExpireTime: string
  discussToGroupUin: string
  discussToGroupMaxMsgSeq: number
  discussToGroupTime: number
  groupFlagExt: number //1073938496,
  authGroupType: number //0,
  groupCreditLevel: number //0,
  groupFlagExt3: number //0,
  groupOwnerId: {
    memberUin: string
    memberUid: string
  }
  createTime: string
}

export enum GroupMemberRole {
  Normal = 2,
  Admin = 3,
  Owner = 4,
}

export interface GroupMember {
  uid: string
  qid: string
  uin: string
  nick: string
  remark: string
  cardType: number
  cardName: string
  role: GroupMemberRole
  avatarPath: string
  shutUpTime: number
  isDelete: boolean
  isSpecialConcerned: boolean
  isSpecialShield: boolean
  isRobot: boolean
  groupHonor: Uint8Array
  memberRealLevel: number
  memberLevel: number
  globalGroupLevel: number
  globalGroupPoint: number
  memberTitleId: number
  memberSpecialTitle: string
  specialTitleExpireTime: string
  userShowFlag: number
  userShowFlagNew: number
  richFlag: number
  mssVipType: number
  bigClubLevel: number
  bigClubFlag: number
  autoRemark: string
  creditLevel: number
  joinTime: number
  lastSpeakTime: number
  memberFlag: number
  memberFlagExt: number
  memberMobileFlag: number
  memberFlagExt2: number
  isSpecialShielded: boolean
  cardNameId: number
}

export interface PublishGroupBulletinReq {
  text: string
  picInfo?: {
    id: string
    width: number
    height: number
  }
  oldFeedsId: ''
  pinned: number
  confirmRequired: number
}

export interface GroupAllInfo {
  groupCode: string
  ownerUid: string
  groupFlag: number
  groupFlagExt: number
  maxMemberNum: number
  memberNum: number
  groupOption: number
  classExt: number
  groupName: string
  fingerMemo: string
  groupQuestion: string
  certType: number
  shutUpAllTimestamp: number
  shutUpMeTimestamp: number //解除禁言时间
  groupTypeFlag: number
  privilegeFlag: number
  groupSecLevel: number
  groupFlagExt3: number
  isConfGroup: number
  isModifyConfGroupFace: number
  isModifyConfGroupName: number
  noFigerOpenFlag: number
  noCodeFingerOpenFlag: number
  groupFlagExt4: number
  groupMemo: string
  cmdUinMsgSeq: number
  cmdUinJoinTime: number
  cmdUinUinFlag: number
  cmdUinMsgMask: number
  groupSecLevelInfo: number
  cmdUinPrivilege: number
  cmdUinFlagEx2: number
  appealDeadline: number
  remarkName: number
  isTop: boolean
  richFingerMemo: string
  groupAnswer: string
  joinGroupAuth: string
  isAllowModifyConfGroupName: number
}

export interface GroupBulletinListResult {
  groupCode: string
  srvCode: number
  readOnly: number
  role: number
  inst: unknown[]
  feeds: {
    uin: string
    feedId: string
    publishTime: string
    msg: {
      text: string
      textFace: string
      pics: {
        id: string
        width: number
        height: number
      }[]
      title: string
    }
    type: number
    fn: number
    cn: number
    vn: number
    settings: {
      isShowEditCard: number
      remindTs: number
      tipWindowType: number
      confirmRequired: number
    }
    pinned: number
    readNum: number
    is_read: number
    is_all_confirm: number
  }[]
  groupInfo: {
    groupCode: string
    classId: number
  }
  gln: number
  tst: number
  publisherInfos: {
    uin: string
    nick: string
    avatar: string
  }[]
  server_time: string
  svrt: string
  nextIndex: number
  jointime: string
}

export enum GroupMsgMask {
  AllowNotify = 1,  // 允许提醒
  AllowNotNotify = 4,  // 接受消息不提醒
  BoxNotNotify = 2,  // 收进群助手不提醒
  NotAllow = 3,  // 屏蔽
}
