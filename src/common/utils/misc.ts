import { Dict, isNonNullable } from 'cosmokit'
import { defineProperty } from 'cosmokit'

export function isNumeric(str: string) {
  return /^\d+$/.test(str)
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
  return array.filter(e => isNonNullable(e))
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

export const cloneObj = <T>(obj: T) => Object.assign(
  Object.create(Object.getPrototypeOf(obj)),
  obj
) as T

export function uint32ToIPV4Addr(value: number) {
  return [
    value & 0xFF,
    (value >> 8) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 24) & 0xFF
  ].join('.')
}

export function sleep(ms = 0) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function isHttpUrl(str: string) {
  return /^https?:\/\/.+/.test(str)
}

export function formatYYYYMMDD(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * 将数组中指定 index 的元素移动到另一个 index 位置
 * @param arr 目标数组 (原地修改)
 * @param from 源元素 index
 * @param to 目标 index
 * @returns 修改后的原数组
 */
export function moveElement<T>(arr: T[], from: number, to: number): T[] {
  if (arr.length === 0) return arr
  if (from === to) return arr

  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  return arr
}
