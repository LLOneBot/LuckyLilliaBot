import { Dict } from 'cosmokit'

// 序列化结果，处理 Map 等特殊类型
export function serializeResult(result: unknown): unknown {
  if (result === null || result === undefined) return result
  if (result instanceof Map) {
    const obj: Dict = {}
    for (const [key, value] of result) {
      obj[String(key)] = serializeResult(value)
    }
    return obj
  }
  if (Array.isArray(result)) {
    return result.map(item => serializeResult(item))
  }
  if (typeof result === 'object') {
    const obj: Dict = {}
    for (const [key, value] of Object.entries(result)) {
      obj[key] = serializeResult(value)
    }
    return obj
  }
  return result
}

export function encodeGroupRequestFlag(groupCode: number, seq: number, type: number, doubt: boolean) {
  return `${groupCode}|${seq}|${type}|${doubt ? 1 : 0}`
}

export function decodeGroupRequestFlag(flag: string) {
  const flagitem = flag.split('|')
  const groupCode = +flagitem[0]
  const seq = +flagitem[1]
  const type = +flagitem[2]
  const doubt = flagitem[3] === '1'
  return {
    groupCode,
    seq,
    type,
    doubt
  }
}
