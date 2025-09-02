export enum Sex {
  Unknown = 0,
  Male = 1,
  Female = 2,
  Hidden = 255
}

export interface QQLevel {
  penguinNum?: number  // 256
  crownNum: number  // 64
  sunNum: number  // 16
  moonNum: number  // 4
  starNum: number  // 1
}

export interface User {
  uid: string // 加密的字符串
  uin: string // QQ号
  nick: string
  avatarUrl?: string
  longNick?: string // 签名
  remark?: string
  sex?: Sex
  qqLevel?: QQLevel
  qid?: string
  birthday_year?: number
  birthday_month?: number
  birthday_day?: number
  topTime?: string
  constellation?: number
  shengXiao?: number
  kBloodType?: number
  homeTown?: string //"0-0-0",
  makeFriendCareer?: number
  pos?: string
  eMail?: string
  phoneNum?: string
  college?: string
  country?: string
  province?: string
  city?: string
  postCode?: string
  address?: string
  isBlock?: boolean
  isSpecialCareOpen?: boolean
  isSpecialCareZone?: boolean
  ringId?: string
  regTime?: number
  interest?: string
  labels?: string[]
  isHideQQLevel?: number
  privilegeIcon?: {
    jumpUrl: string
    openIconList: unknown[]
    closeIconList: unknown[]
  }
  photoWall?: {
    picList: unknown[]
  }
  vipFlag?: boolean
  yearVipFlag?: boolean
  svipFlag?: boolean
  vipLevel?: number
  status?: number
  qidianMasterFlag?: number
  qidianCrewFlag?: number
  qidianCrewFlag2?: number
  extStatus?: number
  recommendImgFlag?: number
  disableEmojiShortCuts?: number
  pendantId?: string
  age?: number
}

export interface SelfInfo extends User {
  online?: boolean
}

export interface Friend extends User {
}

export interface CategoryFriend {
  categoryId: number
  categorySortId: number
  categroyName: string
  categroyMbCount: number
  onlineCount: number
  buddyList: SimpleInfo[]
  buddyUids: string[]
}

export interface CoreInfo {
  uid: string
  uin: string
  nick: string
  remark: string
}

export interface BaseInfo {
  qid: string
  longNick: string
  birthday_year: number
  birthday_month: number
  birthday_day: number
  age: number
  sex: Sex
  eMail: string
  phoneNum: string
  categoryId: number
  richTime: number
  richBuffer: Uint8Array
}

interface MusicInfo {
  buf: string
}

interface VideoBizInfo {
  cid: string
  tvUrl: string
  synchType: string
}

interface VideoInfo {
  name: string
}

interface ExtOnlineBusinessInfo {
  buf: string
  customStatus: unknown
  videoBizInfo: VideoBizInfo
  videoInfo: VideoInfo
}

interface ExtBuffer {
  buf: string
}

interface UserStatus {
  uid: string
  uin: string
  status: number
  extStatus: number
  batteryStatus: number
  termType: number
  netType: number
  iconType: number
  customStatus: unknown
  setTime: string
  specialFlag: number
  abiFlag: number
  eNetworkType: number
  showName: string
  termDesc: string
  musicInfo: MusicInfo
  extOnlineBusinessInfo: ExtOnlineBusinessInfo
  extBuffer: ExtBuffer
}

interface PrivilegeIcon {
  jumpUrl: string
  openIconList: unknown[]
  closeIconList: unknown[]
}

interface VasInfo {
  vipFlag: boolean
  yearVipFlag: boolean
  svipFlag: boolean
  vipLevel: number
  bigClub: boolean
  bigClubLevel: number
  nameplateVipType: number
  grayNameplateFlag: number
  superVipTemplateId: number
  diyFontId: number
  pendantId: number
  pendantDiyId: number
  faceId: number
  vipFont: number
  vipFontType: number
  magicFont: number
  fontEffect: number
  newLoverDiamondFlag: number
  extendNameplateId: number
  diyNameplateIDs: unknown[]
  vipStartFlag: number
  vipDataFlag: number
  gameNameplateId: string
  gameLastLoginTime: string
  gameRank: number
  gameIconShowFlag: boolean
  gameCardId: string
  vipNameColorId: string
  privilegeIcon: PrivilegeIcon
}

export interface SimpleInfo {
  uid?: string
  uin?: string
  coreInfo: CoreInfo
  baseInfo: BaseInfo
  status: UserStatus | null
  vasInfo: VasInfo | null
  relationFlags: RelationFlags | null
  otherFlags: unknown | null
  intimate: unknown | null
}

interface RelationFlags {
  topTime: string
  isBlock: boolean
  isMsgDisturb: boolean
  isSpecialCareOpen: boolean
  isSpecialCareZone: boolean
  ringId: string
  isBlocked: boolean
  recommendImgFlag: number
  disableEmojiShortCuts: number
  qidianMasterFlag: number
  qidianCrewFlag: number
  qidianCrewFlag2: number
  isHideQQLevel: number
  isHidePrivilegeIcon: number
}

interface CommonExt {
  constellation: number
  shengXiao: number
  kBloodType: number
  homeTown: string
  makeFriendCareer: number
  pos: string
  college: string
  country: string
  province: string
  city: string
  postCode: string
  address: string
  regTime: number
  interest: string
  labels: string[]
  qqLevel: QQLevel
}

interface Pic {
  picId: string
  picTime: number
  picUrlMap: Record<string, string>
}

interface PhotoWall {
  picList: Pic[]
}

export interface UserDetailInfoV2 {
  uid: string
  uin: string
  simpleInfo: SimpleInfo
  commonExt: CommonExt | null
  photoWall: PhotoWall | null
}

export interface UserDetailInfo {
  uid: string
  qid: string
  uin: string
  nick: string
  remark: string
  longNick: string
  //avatarUrl: string
  birthday_year: number
  birthday_month: number
  birthday_day: number
  sex: number
  topTime: string
  constellation: number
  shengXiao: number
  kBloodType: number
  homeTown: string
  makeFriendCareer: number
  pos: string
  eMail: string
  phoneNum: string
  college: string
  country: string
  province: string
  city: string
  postCode: string
  address: string
  isBlock: boolean
  isSpecialCareOpen: boolean
  isSpecialCareZone: boolean
  ringId: string
  regTime: number
  interest: string
  termType: number
  labels: unknown[]
  qqLevel: { crownNum: number, sunNum: number, moonNum: number, starNum: number }
  isHideQQLevel: number
  privilegeIcon: { jumpUrl: string, openIconList: unknown[], closeIconList: unknown[] }
  isHidePrivilegeIcon: number
  photoWall: { picList: unknown[] }
  vipFlag: boolean
  yearVipFlag: boolean
  svipFlag: boolean
  vipLevel: number
  status: number
  qidianMasterFlag: number
  qidianCrewFlag: number
  qidianCrewFlag2: number
  extStatus: number
  recommendImgFlag: number
  disableEmojiShortCuts: number
  pendantId: string
  vipNameColorId: string
  age?: number
}

export interface BuddyProfileLikeReq {
  friendUids: string[]
  basic: number
  vote: number
  favorite: number
  userProfile: number
  type: number
  start: number
  limit: number
}

export enum BuddyListReqType {
  KNOMAL,
  KLETTER
}

export enum UserDetailSource {
  KDB,
  KSERVER
}

export enum ProfileBizType {
  KALL,
  KBASEEXTEND,
  KVAS,
  KQZONE,
  KOTHER
}

export interface MiniProfile {
  nick: string
  longNick: string
  sex: number
  birthday: {
    birthday_year: number
    birthday_month: number
    birthday_day: number
  }
  location: {
    country: string
    province: string
    city: string
    zone: string
  }
}
