import { createHmac } from 'node:crypto'
import type { SchemaNode } from '@/common/schema/model'

/** What describe() shows for a stored secret; writing it back (or an empty string) keeps the stored one. */
export const SECRET_MASK = '********'

interface Issue {
  message: string
  path: string[]
}

/**
 * Where a schema keeps its `role('secret')` fields, as dotted paths; `*` stands for every item of a list and every
 * value of a dict.
 */
export function secretPaths(root: SchemaNode | null): string[] {
  const found = new Set<string>()
  // Schema.lazy() makes the schema a graph: a node already on the way down is not walked again, so a recursive
  // schema has its secrets found down to where it repeats, not below
  const walk = (node: SchemaNode | undefined, at: string[], visiting: Set<SchemaNode>) => {
    if (!node || visiting.has(node)) return
    if (node.meta.role === 'secret') {
      if (at.length) found.add(at.join('.'))
      return
    }
    visiting.add(node)
    if (node.type === 'object') {
      for (const [key, inner] of Object.entries(node.dict ?? {})) walk(inner, [...at, key], visiting)
    } else if (node.type === 'array' || node.type === 'dict') {
      walk(node.inner, [...at, '*'], visiting)
    } else if (node.type === 'tuple') {
      node.list?.forEach((inner, index) => walk(inner, [...at, String(index)], visiting))
    } else if (node.list) {
      // union, intersect: every member is the same place
      for (const member of node.list) walk(member, at, visiting)
    } else {
      walk(node.inner, at, visiting)
    }
    visiting.delete(node)
  }
  walk(root ?? undefined, [], new Set())
  return [...found]
}

interface Place {
  parent: Record<string, unknown>
  key: string
  path: string[]
}

/** What a path points to in a value; `*` fans out over the items of a list or the values of a dict */
function* places(node: unknown, parts: string[], at: string[] = []): Generator<Place> {
  if (!node || typeof node !== 'object') return
  const [head, ...rest] = parts
  const record = node as Record<string, unknown>
  for (const key of head === '*' ? Object.keys(record) : [head]) {
    if (rest.length) yield* places(record[key], rest, [...at, key])
    else yield { parent: record, key, path: [...at, key] }
  }
}

/** Names a stored secret in its mask, and cannot be turned back into it without the salt */
function tokenOf(secret: string, salt: Uint8Array): string {
  return createHmac('sha256', salt).update(secret).digest('hex').slice(0, 8)
}

const listed = (dotted: string) => dotted.split('.').includes('*')

/** A secret in a list masks as `********#<token>`: its item may move before the value comes back */
export function maskSecrets(value: unknown, secrets: string[], salt: Uint8Array): unknown {
  if (!secrets.length) return value
  const copy = structuredClone(value)
  for (const dotted of secrets) {
    for (const place of places(copy, dotted.split('.'))) {
      const secret = place.parent[place.key]
      if (typeof secret !== 'string' || !secret) continue
      place.parent[place.key] = listed(dotted) ? `${SECRET_MASK}#${tokenOf(secret, salt)}` : SECRET_MASK
    }
  }
  return copy
}

/**
 * Puts the stored secrets back where a write sent masks. At a fixed place a mask, a blank or nothing keeps the
 * stored value, unless `clear` asks to empty it; a new value always wins, so typing a password after pressing
 * "clear" stores the typed one. In a list a mask finds its secret by token, wherever its item went, and a blank is
 * a blank. A token matching nothing stored (the secret changed meanwhile) is an issue, not a guess.
 */
export function restoreSecrets(
  next: unknown, current: unknown, secrets: string[], clear: string[], salt: Uint8Array,
): { value: unknown; issues: Issue[] } {
  if (!secrets.length) return { value: next, issues: [] }
  const copy = structuredClone(next)
  const issues: Issue[] = []
  for (const dotted of secrets) {
    const parts = dotted.split('.')
    if (!listed(dotted)) {
      for (const place of places(copy, parts)) {
        const sent = place.parent[place.key]
        if (sent !== SECRET_MASK && sent !== '' && sent !== undefined) continue
        if (clear.includes(dotted)) {
          place.parent[place.key] = ''
          continue
        }
        const [stored] = places(current, parts)
        if (stored && stored.parent[stored.key] !== undefined) place.parent[place.key] = stored.parent[stored.key]
      }
      continue
    }
    const byToken = new Map<string, string>()
    const byPath = new Map<string, string>()
    for (const place of places(current, parts)) {
      const secret = place.parent[place.key]
      if (typeof secret !== 'string' || !secret) continue
      byToken.set(tokenOf(secret, salt), secret)
      byPath.set(place.path.join('.'), secret)
    }
    for (const place of places(copy, parts)) {
      const sent = place.parent[place.key]
      if (typeof sent !== 'string') continue
      if (sent === SECRET_MASK) {
        // A writer that sends the bare mask: the same place is the best there is
        place.parent[place.key] = byPath.get(place.path.join('.')) ?? ''
      } else if (sent.startsWith(`${SECRET_MASK}#`)) {
        const secret = byToken.get(sent.slice(SECRET_MASK.length + 1))
        if (secret === undefined) issues.push({ path: place.path, message: '保存过的这个值已经变了，请重新填写' })
        else place.parent[place.key] = secret
      }
    }
  }
  return { value: copy, issues }
}
