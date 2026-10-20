import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import JSON5 from 'json5'

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
  private writing: Promise<void> = Promise.resolve()

  constructor(readonly file: string) {}

  async load(): Promise<{ data: PluginsFile; error?: string }> {
    if (!existsSync(this.file)) return { data: { version: 1, entries: [] } }
    const raw = await readFile(this.file, 'utf8')
    try {
      return { data: normalize(JSON5.parse(raw)) }
    } catch (e) {
      // Move the broken file aside instead of letting the next save overwrite the user's edits.
      const backup = `${this.file}.broken-${Date.now()}`
      await rename(this.file, backup)
      return {
        data: { version: 1, entries: [] },
        error: `${(e as Error).message} (moved to ${path.basename(backup)})`,
      }
    }
  }

  save(data: PluginsFile): Promise<void> {
    const content = JSON.stringify(data, null, 2) + '\n'
    this.writing = this.writing.catch(() => {}).then(() => this.write(content))
    return this.writing
  }

  private async write(content: string) {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, content, 'utf8')
    try {
      await rename(tmp, this.file)
    } catch {
      // Windows refuses the rename while another process holds the target open.
      await writeFile(this.file, content, 'utf8')
      await unlink(tmp).catch(() => {})
    }
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
