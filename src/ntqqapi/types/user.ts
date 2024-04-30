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

export interface Friend extends User {}
