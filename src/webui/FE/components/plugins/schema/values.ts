import { classifyUnion, mergeIntersect, SchemaNode } from './model'

// The diff / merge helpers moved to src/common/schema/diff.ts (shared with the backend, schema-aware).
export { isPlainObject, isEqual, withDefaults, stripDefaults } from '@shared/schema/diff'

/** What a freshly added array item, dict entry or union branch starts as. (WebUI form only.) */
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
