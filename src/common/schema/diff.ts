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
 * Whether the diff recurses into `value` per key, or treats it as one whole value.
 *
 * §5 rule: only an `object` node (and an intersection of objects, which edits as one object) recurses;
 * `dict` / `array` / `union` / scalar nodes replace wholesale. A null node means "no schema" (the JSON
 * fallback editor), where we keep the old value-driven behavior: recurse any plain object.
 *
 * This is the fix for the dict bug: a dict's runtime value is a plain object, so the old value-driven
 * code recursed it and dropped entries that happened to equal a default-keyed value. Whole-replace keeps
 * the user's dict intact, and a later change to the dict's default no longer leaks stale entries back in.
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

/** Fills keys missing from `value` with their defaults, so the form shows what the plugin will get. */
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

/**
 * Drops everything equal to its default, so only what the user changed is stored and a plugin update that
 * moves a default still reaches them. Undefined when nothing differs.
 */
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
