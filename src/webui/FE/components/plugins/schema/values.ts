import { classifyUnion, mergeIntersect, SchemaNode } from './model'

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

/** Fills keys missing from `value` with their defaults, so the form shows what the plugin will get. */
export function withDefaults(value: unknown, defaults: unknown): unknown {
  if (value === undefined || value === null) return structuredClone(defaults)
  if (isPlainObject(value) && isPlainObject(defaults)) {
    const result: Record<string, unknown> = { ...value }
    for (const [key, fallback] of Object.entries(defaults)) result[key] = withDefaults(value[key], fallback)
    return result
  }
  return value
}

/**
 * Drops everything equal to its default, so plugins.json only holds what the user changed and a
 * plugin update that moves a default still reaches them. Undefined when nothing differs.
 */
export function stripDefaults(value: unknown, defaults: unknown): unknown {
  if (isEqual(value, defaults)) return undefined
  if (isPlainObject(value) && isPlainObject(defaults)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const kept = stripDefaults(item, defaults[key])
      if (kept !== undefined) result[key] = kept
    }
    return Object.keys(result).length ? result : undefined
  }
  return value
}

/** What a freshly added array item, dict entry or union branch starts as. */
export function initialValue(node: SchemaNode): unknown {
  if (node.meta.default !== undefined && node.type !== 'object') return structuredClone(node.meta.default)
  switch (node.type) {
    case 'object': {
      const result: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(node.dict ?? {})) {
        const value = initialValue(child)
        if (value !== undefined) result[key] = value
      }
      return result
    }
    case 'intersect': {
      const merged = mergeIntersect(node)
      return merged ? initialValue(merged) : undefined
    }
    case 'array':
    case 'tuple':
      return []
    case 'dict':
      return {}
    case 'string':
      return ''
    case 'number':
      return node.meta.min ?? 0
    case 'boolean':
      return false
    case 'const':
      return node.value
    case 'transform':
      return node.inner && initialValue(node.inner)
    case 'union': {
      const view = classifyUnion(node)
      if (view.kind === 'select') return view.options[0]?.value
      if (view.kind === 'toggle') return false
      if (view.kind === 'tagged') return initialValue(view.branches[0].node)
      if (view.kind === 'single' || view.kind === 'optional') return initialValue(view.inner)
      return undefined
    }
    default:
      return undefined
  }
}
