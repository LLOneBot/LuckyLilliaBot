import { QQLevel } from '@/ntqqapi/types'
import { Dict, isNullable } from 'cosmokit'
import { defineProperty } from 'cosmokit'

export function isNumeric(str: string) {
  return /^\d+$/.test(str)
}

export function calcQQLevel(level: QQLevel) {
  const { penguinNum, crownNum, sunNum, moonNum, starNum } = level
  return (penguinNum || 0) * 256 + crownNum * 64 + sunNum * 16 + moonNum * 4 + starNum
}


/** 在保证老对象已有的属性不变化的情况下将新对象的属性复制到老对象 */
export function mergeNewProperties(newObj: Dict, oldObj: Dict) {
  Object.keys(newObj).forEach((key) => {
    // 如果老对象不存在当前属性，则直接复制
    if (!oldObj.hasOwnProperty(key)) {
      oldObj[key] = newObj[key]
    } else {
      // 如果老对象和新对象的当前属性都是对象，则递归合并
      if (typeof oldObj[key] === 'object' && typeof newObj[key] === 'object') {
        mergeNewProperties(newObj[key], oldObj[key])
      } else if (typeof oldObj[key] === 'object' || typeof newObj[key] === 'object') {
        // 属性冲突，有一方不是对象，直接覆盖
        oldObj[key] = newObj[key]
      }
    }
  })
}

export function filterNullable<T>(array: T[]) {
  return array.filter(e => !isNullable(e)) as NonNullable<T>[]
}

export function parseBool(value: string) {
  if (['', 'true', '1'].includes(value)) {
    return true
  }
  return false
}

export class DetailedError<T> extends Error {
  public data!: T

  constructor(message: string, data: T) {
    super(message)
    defineProperty(this, 'data', data)
  }
}

export type DeepNonNullable<T> = T extends object
? { [K in keyof T]-?: DeepNonNullable<NonNullable<T[K]>> }
  : NonNullable<T>
