export interface SchemaMeta {
  default?: unknown
  required?: boolean
  hidden?: boolean
  disabled?: boolean
  collapse?: boolean
  role?: string
  extra?: any
  link?: string
  description?: string | Record<string, string>
  badges?: { text: string; type: string }[]
  pattern?: { source: string; flags?: string }
  min?: number
  max?: number
  step?: number
}

/** A schemastery schema with its uid references resolved. Lazy schemas make it a graph, not a tree. */
export interface SchemaNode {
  type: string
  meta: SchemaMeta
  value?: unknown
  inner?: SchemaNode
  sKey?: SchemaNode
  list?: SchemaNode[]
  dict?: Record<string, SchemaNode>
  bits?: Record<string, number>
}

type Ref = number | WireNode

interface WireNode {
  type: string
  meta?: SchemaMeta
  value?: unknown
  inner?: Ref
  sKey?: Ref
  list?: Ref[]
  dict?: Record<string, Ref>
  bits?: Record<string, number>
}

const ANY: SchemaNode = { type: 'any', meta: {} }

/** Resolves schemastery's toJSON() output, `{ uid, refs }`, into linked nodes. */
export function hydrate(json: { uid: number; refs: Record<string, unknown> }): SchemaNode {
  const refs = json.refs as Record<string, WireNode>
  const cache = new Map<number, SchemaNode>()

  const resolve = (ref: Ref): SchemaNode => {
    if (typeof ref !== 'number') return build(ref)
    const hit = cache.get(ref)
    if (hit) return hit
    const wire = refs[ref]
    if (!wire) return ANY
    // Schema.lazy() wraps the real schema; treat it as that schema
    if (wire.type === 'lazy' && wire.inner !== undefined) {
      const target = resolve(wire.inner)
      cache.set(ref, target)
      return target
    }
    const node: SchemaNode = { type: wire.type, meta: wire.meta ?? {} }
    // Registered before its children so a schema that refers back to an ancestor terminates
    cache.set(ref, node)
    fill(node, wire)
    return node
  }

  const build = (wire: WireNode): SchemaNode => {
    const node: SchemaNode = { type: wire.type, meta: wire.meta ?? {} }
    fill(node, wire)
    return node
  }

  const fill = (node: SchemaNode, wire: WireNode) => {
    if ('value' in wire) node.value = wire.value
    if (wire.inner !== undefined) node.inner = resolve(wire.inner)
    if (wire.sKey !== undefined) node.sKey = resolve(wire.sKey)
    if (wire.list) node.list = wire.list.map(resolve)
    if (wire.dict) node.dict = Object.fromEntries(Object.entries(wire.dict).map(([key, ref]) => [key, resolve(ref)]))
    if (wire.bits) node.bits = wire.bits
  }

  return resolve(json.uid)
}

/** schemastery stores a plain description under '' and i18n() ones under their locale. */
export function localize(text: string | Record<string, string> | undefined): string | undefined {
  if (!text || typeof text === 'string') return text || undefined
  return text['zh-CN'] ?? text.zh ?? text[''] ?? Object.values(text)[0]
}

/** `is` / `function` values (Date, RegExp instances...) have no JSON form to edit. */
function editable(node: SchemaNode) {
  return !['is', 'function', 'never'].includes(node.type)
}

export type UnionView =
  | { kind: 'select'; options: { value: unknown; label: string }[] }
  | { kind: 'toggle'; on: SchemaNode }
  | { kind: 'optional'; inner: SchemaNode }
  | { kind: 'tagged'; key: string; branches: { value: unknown; label: string; node: SchemaNode }[] }
  | { kind: 'single'; inner: SchemaNode }
  | { kind: 'json' }

export function classifyUnion(node: SchemaNode): UnionView {
  const members = (node.list ?? []).filter(editable)
  // Schema.date() / regExp() are union(is(X), transform(string)): only the string side is editable
  if (members.length === 1) return { kind: 'single', inner: members[0] }
  if (members.length && members.every(member => member.type === 'const')) {
    return {
      kind: 'select',
      options: members.map(member => ({ value: member.value, label: localize(member.meta.description) ?? String(member.value) })),
    }
  }
  const empty = members.filter(member => member.type === 'const' && member.value == null)
  if (empty.length && members.length - empty.length === 1) {
    return { kind: 'optional', inner: members.find(member => !empty.includes(member))! }
  }
  if (members.length === 2) {
    const off = members.find(member => member.type === 'const' && member.value === false)
    if (off) return { kind: 'toggle', on: members.find(member => member !== off)! }
  }
  if (members.length > 1 && members.every(member => member.type === 'object' && member.dict)) {
    const key = Object.keys(members[0].dict!).find(key => members.every(member => member.dict![key]?.type === 'const'))
    if (key) {
      const values = members.map(member => member.dict![key].value)
      if (new Set(values).size === values.length) {
        return {
          kind: 'tagged',
          key,
          branches: members.map((member, index) => ({
            value: values[index],
            label: localize(member.meta.description) ?? localize(member.dict![key].meta.description) ?? String(values[index]),
            node: member,
          })),
        }
      }
    }
  }
  return { kind: 'json' }
}

/** An intersection of objects edits as one object; undefined when the members are not all objects. */
export function mergeIntersect(node: SchemaNode): SchemaNode | undefined {
  const members = (node.list ?? []).map(member => member.type === 'intersect' ? mergeIntersect(member) : member)
  if (!members.every(member => member?.type === 'object' && member.dict)) return
  return { type: 'object', meta: node.meta, dict: Object.assign({}, ...members.map(member => member!.dict)) }
}
