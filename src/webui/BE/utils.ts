// 序列化结果，处理 Map 等特殊类型
export function serializeResult(result: any): any {
  if (result === null || result === undefined) return result
  if (result instanceof Map) {
    const obj: Record<string, any> = {}
    for (const [key, value] of result) {
      obj[String(key)] = serializeResult(value)
    }
    return obj
  }
  if (Array.isArray(result)) {
    return result.map(item => serializeResult(item))
  }
  if (typeof result === 'object') {
    const obj: Record<string, any> = {}
    for (const [key, value] of Object.entries(result)) {
      obj[key] = serializeResult(value)
    }
    return obj
  }
  return result
}
