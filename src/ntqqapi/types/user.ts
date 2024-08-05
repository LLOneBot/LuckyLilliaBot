export enum Sex {
  male = 0,
  female = 2,
  unknown = 255,
}

export interface QQLevel {
  crownNum: number
  sunNum: number
  moonNum: number
  starNum: number
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
}

export interface SelfInfo extends User {
  online?: boolean
}

export interface Friend extends User {
}

export interface CategoryFriend {
  categoryId: number
  categroyName: string
  categroyMbCount: number
  buddyList: User[]
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
  sex: number
  eMail: string
  phoneNum: string
  categoryId: number
  richTime: number
  richBuffer: string
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
  customStatus: any
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
  customStatus: any
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
  openIconList: any[]
  closeIconList: any[]
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
  diyNameplateIDs: any[]
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
  otherFlags: any | null
  intimate: any | null
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

export interface FriendV2 extends SimpleInfo {
  categoryId?: number
  categroyName?: string
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
  labels: any[]
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

export interface UserDetailInfoListenerArg {
  uid: string
  uin: string
  simpleInfo: SimpleInfo
  commonExt: CommonExt
  photoWall: PhotoWall
}