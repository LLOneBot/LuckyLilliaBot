export interface GroupSimpleInfo {
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
  cmdUinMsgMask: number
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
  remarkName: string
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

export enum GroupInfoSource {
  Unspecified,
  BigDataCard,
  DataCard,
  Notice,
  AIO,
  RecentContact,
  MorePanel
}

export interface GroupGeoInfo {
  ownerUid: string
  SetTime: number
  CityId: number
  Longitude: string
  Latitude: string
  GeoContent: string
  poiId: string
}

export interface GroupCardPrefix {
  introduction: string
  rptPrefix: any[]
}

export interface GroupOwnerId {
  memberUin: string
  memberUid: string
  memberQid: string
}

export interface GroupBindGuildIds {
  guildIds: any[]
}

export interface GroupExtFlameData {
  switchState: number
  state: number
  dayNums: any[]
  version: number
  updateTime: string
  isDisplayDayNum: boolean
}

export interface GroupExcludeGuildIds {
  guildIds: any[]
}

export interface GroupExt {
  groupInfoExtSeq: number
  reserve: number
  luckyWordId: string
  lightCharNum: number
  luckyWord: string
  starId: number
  essentialMsgSwitch: number
  todoSeq: number
  blacklistExpireTime: number
  isLimitGroupRtc: number
  companyId: number
  hasGroupCustomPortrait: number
  bindGuildId: string
  groupOwnerId: GroupOwnerId
  essentialMsgPrivilege: number
  msgEventSeq: string
  inviteRobotSwitch: number
  gangUpId: string
  qqMusicMedalSwitch: number
  showPlayTogetherSwitch: number
  groupFlagPro1: string
  groupBindGuildIds: GroupBindGuildIds
  viewedMsgDisappearTime: string
  groupExtFlameData: GroupExtFlameData
  groupBindGuildSwitch: number
  groupAioBindGuildId: string
  groupExcludeGuildIds: GroupExcludeGuildIds
  fullGroupExpansionSwitch: number
  fullGroupExpansionSeq: string
  inviteRobotMemberSwitch: number
  inviteRobotMemberExamine: number
  groupSquareSwitch: number
}

export interface GroupSchoolInfo {
  location: string
  grade: number
  school: string
}

export interface GroupHeadPortrait {
  portraitCnt: number
  portraitInfo: any[]
  defaultId: number
  verifyingPortraitCnt: number
  verifyingPortraitInfo: any[]
}

export interface GroupExtOnly {
  tribeId: number
  moneyForAddGroup: number
}

export enum LocalExitGroupReason {
  NO_QUIT = 0,  // 没有退出群，正常状态
  KICKED = 1,  // 被踢出
  DISMISS = 2,  // 群解散
  SELF_QUIT = 3  // 自己主动退出
}

export interface GroupDetailInfo {
  groupCode: string
  groupUin: string
  ownerUid: string
  ownerUin: string
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
  richFingerMemo: string
  tagRecord: any[]
  shutUpAllTimestamp: number
  shutUpMeTimestamp: number
  groupTypeFlag: number
  privilegeFlag: number
  groupSecLevel: number
  groupFlagExt3: number
  isConfGroup: number
  isModifyConfGroupFace: number
  isModifyConfGroupName: number
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
  remarkName: string
  isTop: boolean
  groupFace: number
  groupGeoInfo: GroupGeoInfo
  certificationText: string
  cmdUinRingtoneId: number
  longGroupName: string
  autoAgreeJoinGroupUserNumForConfGroup: number
  autoAgreeJoinGroupUserNumForNormalGroup: number
  cmdUinFlagExt3Grocery: number
  groupCardPrefix: GroupCardPrefix
  groupExt: GroupExt
  msgLimitFrequency: number
  hlGuildAppid: number
  hlGuildSubType: number
  isAllowRecallMsg: number
  confUin: string
  confMaxMsgSeq: number
  confToGroupTime: number
  groupSchoolInfo: GroupSchoolInfo
  activeMemberNum: number
  groupGrade: number
  groupCreateTime: number
  subscriptionUin: string
  subscriptionUid: string
  noFingerOpenFlag: number
  noCodeFingerOpenFlag: number
  isGroupFreeze: number
  allianceId: string
  groupExtOnly: GroupExtOnly
  isAllowConfGroupMemberModifyGroupName: number
  isAllowConfGroupMemberNick: number
  isAllowConfGroupMemberAtAll: number
  groupClassText: string
  groupFreezeReason: number
  headPortraitSeq: number
  groupHeadPortrait: GroupHeadPortrait
  cmdUinJoinMsgSeq: number
  cmdUinJoinRealMsgSeq: number
  groupAnswer: string
  groupAdminMaxNum: number
  inviteNoAuthNumLimit: string
  hlGuildOrgId: number
  isAllowHlGuildBinary: number
  localExitGroupReason: LocalExitGroupReason
}
