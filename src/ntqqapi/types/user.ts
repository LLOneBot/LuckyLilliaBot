export enum Sex {
  Unknown = 0,
  Male = 1,
  Female = 2,
  Hidden = 255
}

export interface SelfInfo {
  uid: string
  uin: string
  nick: string
  online: boolean
}

export interface Friend {
  uid: string
  uin: number
  categoryId: number
  categoryName: string
  nick: string
  bio: string
  remark: string
  qid: string
  age: number
  gender: number
  birthdayYear: number
  birthdayMonth: number
  birthdayDay: number
}

export interface FriendCategory {
  categoryId: number
  categoryName: string
  categoryMemberCount: number
  categorySortId: number
}

export interface User {
  uin: number
  nick: string
  bio: string
  gender: number
  remark: string
  level: number
  country: string
  city: string
  school: string
  registerTime: number
  age: number
  qid: string
  birthdayYear: number
  birthdayMonth: number
  birthdayDay: number
  labels: string[]
  isVip: boolean
  isYearsVip: boolean
  vipLevel: number
}
