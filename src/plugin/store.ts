import { randomBytes } from 'node:crypto'
import { JsonFile } from '@/common/jsonFile'

export interface PluginEntry {
  /** Stable across restarts. One package can back several entries, so the name is not a key. */
  id: string
  name: string
  disabled?: boolean
  config?: unknown
}

export interface PluginsFile {
  version: 1
  hmr?: boolean
  entries: PluginEntry[]
}

/** What one account changes about an entry, relative to the global layer. */
export interface PluginOverride {
  config?: unknown
  disabled?: boolean
}

/**
 * The per-account override layer, keyed by entry id. Entries themselves are only ever added or removed in
 * the global file; this layer may only reference ids that already exist there.
 */
export interface PluginOverlayFile {
  version: 1
  entries: Record<string, PluginOverride>
}

export class PluginOverlayStore {
  private readonly jsonFile: JsonFile<PluginOverlayFile>

  constructor(readonly file: string) {
    this.jsonFile = new JsonFile<PluginOverlayFile>(file, {
      defaultValue: (): PluginOverlayFile => ({ version: 1, entries: {} }),
      normalize: normalizeOverlay,
    })
  }

  load(): Promise<{ data: PluginOverlayFile; error?: string }> {
    return this.jsonFile.read()
  }

  save(data: PluginOverlayFile): Promise<void> {
    return this.jsonFile.write(data)
  }
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
    entries.push(entry)
  }
  const data: PluginsFile = { version: 1, entries }
  if (typeof input.hmr === 'boolean') data.hmr = input.hmr
  return data
}

function normalizeOverlay(value: unknown): PluginOverlayFile {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<PluginOverlayFile>
  const entries: Record<string, PluginOverride> = {}
  const source = input.entries && typeof input.entries === 'object' ? input.entries : {}
  for (const [id, raw] of Object.entries(source)) {
    if (!id || !raw || typeof raw !== 'object') continue
    const override: PluginOverride = {}
    if ('config' in raw) override.config = (raw as PluginOverride).config
    if (typeof (raw as PluginOverride).disabled === 'boolean') override.disabled = (raw as PluginOverride).disabled
    if (Object.keys(override).length) entries[id] = override
  }
  return { version: 1, entries }
}
