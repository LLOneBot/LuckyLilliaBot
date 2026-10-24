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
