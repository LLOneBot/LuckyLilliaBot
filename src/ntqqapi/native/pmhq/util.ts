import { Dict } from 'cosmokit'

type DataWrapper = {
  __dataType?: string
  data?: unknown
}

export function deepStringifyMap(obj: unknown): unknown {
  // 基本类型直接返回
  if (typeof obj !== 'object' || obj === null) return obj

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => deepStringifyMap(item))
  }

  // 处理 Map 对象
  if (obj instanceof Map) {
    return {
      __dataType: 'Map',
      data: Array.from(obj.entries()).map(([k, v]) => [
        deepStringifyMap(k),  // 递归处理 key
        deepStringifyMap(v)   // 递归处理 value
      ])
    }
  }

  // 处理普通对象
  const convertedObj: Dict = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      convertedObj[key] = deepStringifyMap((obj as Dict)[key])
    }
  }
  return convertedObj
}

export function deepConvertMap<T>(obj: T): T {
  // 基本类型直接返回
  if (typeof obj !== 'object' || obj === null) return obj

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => deepConvertMap(item)) as T
  }

  // 处理 Map 包装对象
  const potentialMap = obj as DataWrapper
  if (potentialMap.__dataType === 'Map' && 'data' in potentialMap) {
    const entries: [unknown, unknown][] = Array.isArray(potentialMap.data)
      ? potentialMap.data.map(([k, v]) => [
        deepConvertMap(k),
        deepConvertMap(v),
      ])
      : []
    return new Map(entries) as T
  }

  // 处理普通对象
  const convertedObj: Dict = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      convertedObj[key] = deepConvertMap(obj[key])
    }
  }
  return convertedObj as T
}
