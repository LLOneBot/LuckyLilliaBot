import { Dict, isNonNullable } from 'cosmokit'
import { defineProperty } from 'cosmokit'

export function isNumeric(str: string) {
  return /^\d+$/.test(str)
}

/** 只补 oldObj 缺的属性 */
export function mergeNewProperties(newObj: Dict, oldObj: Dict) {
  Object.keys(newObj).forEach((key) => {
    if (!oldObj.hasOwnProperty(key)) {
      oldObj[key] = newObj[key]
    } else {
      if (typeof oldObj[key] === 'object' && typeof newObj[key] === 'object') {
        mergeNewProperties(newObj[key], oldObj[key])
      } else if (typeof oldObj[key] === 'object' || typeof newObj[key] === 'object') {
        oldObj[key] = newObj[key]
      }
    }
  })
}

/** 对象逐 key 递归, 数组和标量整体替换; patch 覆盖已有值 */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainRecord(base) || !isPlainRecord(patch)) return patch
  const result: Dict = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    result[key] = key in base ? deepMerge(base[key], value) : value
  }
  return result
}

function isPlainRecord(value: unknown): value is Dict {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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

export type DeepPartial<T> = T extends object
  ? T extends (...args: any[]) => any
    ? T
    : { [K in keyof T]?: DeepPartial<T[K]> }
  : T

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

/** 结果与输入同序。shouldStop 返回 true 后不再派发新任务, 没启动的位置留 undefined */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  shouldStop?: (result: R, index: number) => boolean
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  if (items.length === 0) return results
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let cursor = 0
  let stopped = false
  async function worker(): Promise<void> {
    while (!stopped && cursor < items.length) {
      const i = cursor++
      const r = await fn(items[i], i)
      results[i] = r
      if (shouldStop?.(r, i)) {
        stopped = true
        break
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

export function isHttpUrl(str: string) {
  return /^https?:\/\/.+/.test(str)
}

export function formatYYYYMMDD(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/** 原地修改, 返回原数组 */
export function moveElement<T>(arr: T[], from: number, to: number): T[] {
  if (arr.length === 0) return arr
  if (from === to) return arr

  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  return arr
}
