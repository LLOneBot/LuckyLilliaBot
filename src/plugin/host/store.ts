import { randomBytes } from 'node:crypto'
import { JsonFile } from '@/common/jsonFile'
import { EntryScope, normalizeScope } from './scope'

export interface PluginEntry {
  /** Stable across restarts. One package can back several entries, so the name is not a key. */
  id: string
  name: string
  disabled?: boolean
  config?: unknown
  /** Where it takes events from; absent: everywhere */
  scope?: EntryScope
}

/** What the user decided about plugins' parts of the WebUI; the plugin page edits it. */
export interface UiPrefs {
  /** Packages whose WebUI module may load. Builtins need no approval. */
  approved: string[]
  /** Slot contributions and sidebar pages left out: `<package>|<slot>|<id>`, `<package>|page|<tab>`. */
  hidden: string[]
  /** Positions of sidebar pages and of contributions to `list` slots, by the same keys, over their own order */
  order: Record<string, number>
}

export interface PluginsFile {
  version: 1
  hmr?: boolean
  ui?: UiPrefs
  entries: PluginEntry[]
  /** Entries whose message listeners run first, in this order; the rest follow as they registered */
  messageOrder?: string[]
  /** Packages the user agreed to run, which have their code run with the bot's rights */
  trusted?: string[]
}

export class PluginStore {
  private readonly jsonFile: JsonFile<PluginsFile>

  constructor(readonly file: string) {
    this.jsonFile = new JsonFile<PluginsFile>(file, {
      defaultValue: (): PluginsFile => ({ version: 1, entries: [] }),
      normalize,
    })
  }

  load(): Promise<{ data: PluginsFile; error?: string }> {
    return this.jsonFile.read()
  }

  save(data: PluginsFile): Promise<void> {
    return this.jsonFile.write(data)
  }
}

export function newEntryId(taken: ReadonlySet<string>): string {
  let id: string
  do {
    id = randomBytes(4).toString('hex')
  } while (taken.has(id))
  return id
}

function normalize(value: unknown): PluginsFile {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<PluginsFile>
  const seen = new Set<string>()
  const entries: PluginEntry[] = []
  for (const entry of Array.isArray(input.entries) ? input.entries : []) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || seen.has(entry.id)) continue
    seen.add(entry.id)
    const scope = normalizeScope(entry.scope)
    if (scope) entry.scope = scope
    else delete entry.scope
    entries.push(entry)
  }
  const data: PluginsFile = { version: 1, entries }
  if (typeof input.hmr === 'boolean') data.hmr = input.hmr
  if (input.ui !== undefined) data.ui = normalizeUi(input.ui)
  if (input.messageOrder !== undefined) data.messageOrder = strings(input.messageOrder).filter(id => seen.has(id))
  if (input.trusted !== undefined) data.trusted = strings(input.trusted)
  return data
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item))] : []

export function normalizeUi(value: unknown): UiPrefs {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const order: Record<string, number> = {}
  if (input.order && typeof input.order === 'object') {
    for (const [key, position] of Object.entries(input.order)) {
      if (typeof position === 'number' && Number.isFinite(position)) order[key] = position
    }
  }
  return { approved: strings(input.approved), hidden: strings(input.hidden), order }
}
