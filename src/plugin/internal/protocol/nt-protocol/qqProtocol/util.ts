import { Dict } from 'cosmokit'

type DataWrapper = {
  __dataType?: string
  data?: unknown
}

export function deepStringifyMap(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj

  if (Array.isArray(obj)) {
    return obj.map(item => deepStringifyMap(item))
  }

  if (obj instanceof Map) {
    return {
      __dataType: 'Map',
      data: Array.from(obj.entries()).map(([k, v]) => [
        deepStringifyMap(k),
        deepStringifyMap(v)
      ])
    }
  }

  const convertedObj: Dict = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      convertedObj[key] = deepStringifyMap((obj as Dict)[key])
    }
  }
  return convertedObj
}

export function deepConvertMap<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) return obj

  if (Array.isArray(obj)) {
    return obj.map(item => deepConvertMap(item)) as T
  }

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

  const convertedObj: Dict = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      convertedObj[key] = deepConvertMap(obj[key])
    }
  }
  return convertedObj as T
}
