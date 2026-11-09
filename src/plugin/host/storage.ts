import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Fiber } from 'cordis'
import type { PluginStorage } from '@luckylillia/plugin-sdk'

const BUILTIN_PREFIX = 'builtin:'
// CON, PRN, AUX, NUL, COM1..9, LPT1..9 cannot be directory names on Windows, extension or not
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/**
 * The directory a package's data lives under. npm names hold at most one slash and never a `+`, so
 * `@scope/name` -> `@scope+name` cannot collide; builtins get `_builtin+<name>` (a colon is not allowed in a
 * Windows path, and no npm name starts with `_`). Anything else, e.g. a hand-edited entry, must not be able
 * to step outside the data root.
 */
export function dataKey(name: string): string {
  const key = name.startsWith(BUILTIN_PREFIX) ? `_builtin+${name.slice(BUILTIN_PREFIX.length)}` : name.replace('/', '+')
  if (!/^[\w@~+-][\w.~+-]*$/.test(key) || key.endsWith('.') || WINDOWS_RESERVED.test(key)) {
    throw new Error(`cannot derive a data directory from plugin name ${JSON.stringify(name)}`)
  }
  return key
}

/** `platform:selfId` as one directory name, `platform+selfId`; what could leave the directory is refused. */
export function botKey(sid: string): string {
  const key = sid.replace(':', '+')
  if (!/^[\w.~@-]+\+[\w.~@-]+$/.test(key) || key.endsWith('.') || WINDOWS_RESERVED.test(key)) {
    throw new Error(`cannot derive a data directory from bot ${JSON.stringify(sid)}`)
  }
  return key
}

export class PluginDataDirs {
  private entries = new WeakMap<Fiber, string>()
  private storages = new WeakMap<Fiber, PluginStorage>()

  constructor(readonly root: string) {}

  sharedDir(name: string): string {
    return path.join(this.root, dataKey(name), 'shared')
  }

  /**
   * The entry's `ctx.baseUrl`: ecosystem plugins such as @cordisjs/plugin-database-sqlite resolve relative
   * paths with `new URL(path, ctx.baseUrl)`. The trailing separator matters, or the last segment is dropped.
   * Undefined for a name no directory can be derived from, so that does not stop the entry from mounting.
   */
  baseUrl(name: string): string | undefined {
    try {
      return pathToFileURL(this.sharedDir(name) + path.sep).href
    } catch {
      return
    }
  }

  /** Called once per mount, before the plugin's apply runs. */
  register(entry: Fiber, name: string) {
    this.entries.set(entry, name)
  }

  /**
   * The storage for code running in `caller`'s fiber, or undefined outside any entry. Found by walking up
   * to the fiber the entry was mounted as. Storage does not depend on a protocol or login state.
   */
  storageOf(caller: Fiber): PluginStorage | undefined {
    const cached = this.storages.get(caller)
    if (cached) return cached
    for (let fiber = caller; ; fiber = fiber.parent.fiber) {
      const name = this.entries.get(fiber)
      if (name !== undefined) {
        const storage = { dir: (scope?: unknown, bot?: unknown) => this.dir(name, scope, bot) } as PluginStorage
        this.storages.set(caller, storage)
        return storage
      }
      if (fiber.parent.fiber === fiber) return
    }
  }

  private async dir(name: string, scope: unknown = 'global', bot?: unknown): Promise<string> {
    let dir: string
    if (scope === 'global') {
      dir = this.sharedDir(name)
    } else if (scope === 'bot') {
      const sid = typeof bot === 'string' ? bot : (bot as { sid?: unknown } | undefined)?.sid
      if (typeof sid !== 'string') throw new TypeError(`ctx.storage.dir('bot', bot): expected a bot or its sid`)
      dir = path.join(this.root, dataKey(name), 'bots', botKey(sid))
      // Older plugins kept QQ data at <package>/<uin>. Reuse it without moving or merging files;
      // a directory already created through the bot API takes precedence. No login service is needed.
      const legacyId = /^luckylillia:([0-9]+)$/.exec(sid)?.[1]
      if (legacyId && !await this.directoryExists(dir)) {
        const legacy = path.join(this.root, dataKey(name), legacyId)
        if (await this.directoryExists(legacy)) dir = legacy
      }
    } else {
      throw new TypeError(`ctx.storage.dir(): unknown scope ${JSON.stringify(scope)}, expected 'global' or 'bot'`)
    }
    await mkdir(dir, { recursive: true })
    return dir
  }

  private async directoryExists(dir: string): Promise<boolean> {
    try {
      const info = await stat(dir)
      if (!info.isDirectory()) throw new Error(`plugin data path is not a directory: ${dir}`)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }
}
