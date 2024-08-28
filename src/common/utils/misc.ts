import { QQLevel } from '@/ntqqapi/types'

export function isNumeric(str: string) {
  return /^\d+$/.test(str)
}

export function calcQQLevel(level: QQLevel) {
  const { crownNum, sunNum, moonNum, starNum } = level
  return crownNum * 64 + sunNum * 16 + moonNum * 4 + starNum
}

/** QQ Build Version  */
export function getBuildVersion(): number {
  const version: string = globalThis.LiteLoader.versions.qqnt
  return +version.split('-')[1]
}