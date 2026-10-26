import { mergeIntersect, SchemaNode } from './model'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => isEqual(item, b[index]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every(key => isEqual(a[key], b[key]))
  }
  return false
}

/**
 * Only an `object` node (or an intersection of objects) recurses per key. `dict` / `array` / `union` /
 * scalars are replaced whole: recursing a dict would drop entries that happen to equal a default. A null
 * node (no schema, the JSON editor) recurses any plain object.
 */
function recurses(node: SchemaNode | null, value: unknown, defaults: unknown): boolean {
  if (!isPlainObject(value) || !isPlainObject(defaults)) return false
  if (node === null) return true
  if (node.type === 'object') return true
  if (node.type === 'intersect') return !!mergeIntersect(node)
  return false
}

function childOf(node: SchemaNode | null, key: string): SchemaNode | null {
  if (!node) return null
  if (node.type === 'object') return node.dict?.[key] ?? null
  if (node.type === 'intersect') return mergeIntersect(node)?.dict?.[key] ?? null
  return null
}

export function withDefaults(node: SchemaNode | null, value: unknown, defaults: unknown): unknown {
  if (value === undefined || value === null) return structuredClone(defaults)
  if (recurses(node, value, defaults)) {
    const result: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [key, fallback] of Object.entries(defaults as Record<string, unknown>)) {
      result[key] = withDefaults(childOf(node, key), (value as Record<string, unknown>)[key], fallback)
    }
    return result
  }
  return value
}

/** Undefined when nothing differs. Storing only changes lets a default moved by a plugin update reach the user. */
export function stripDefaults(node: SchemaNode | null, value: unknown, defaults: unknown): unknown {
  if (isEqual(value, defaults)) return undefined
  if (recurses(node, value, defaults)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const kept = stripDefaults(childOf(node, key), item, (defaults as Record<string, unknown>)[key])
      if (kept !== undefined) result[key] = kept
    }
    return Object.keys(result).length ? result : undefined
  }
  return value
}
