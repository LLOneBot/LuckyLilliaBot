import { mkdir } from 'node:fs/promises'
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

export class PluginDataDirs {
  private entries = new WeakMap<Fiber, string>()
  private storages = new WeakMap<Fiber, PluginStorage>()

  /** `uin` reads the logged-in account; it is only consulted once `account` is known to be available. */
  constructor(readonly root: string, private readonly uin: () => string | undefined) {}

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
   * to the fiber the entry was mounted as, noting on the way whether some fiber injects `account`.
   */
  storageOf(caller: Fiber): PluginStorage | undefined {
    const cached = this.storages.get(caller)
    if (cached) return cached
    let afterLogin = false
    for (let fiber = caller; ; fiber = fiber.parent.fiber) {
      if ('account' in fiber.inject) afterLogin = true
      const name = this.entries.get(fiber)
      if (name !== undefined) {
        const storage: PluginStorage = { dir: scope => this.dir(name, scope, afterLogin) }
        this.storages.set(caller, storage)
        return storage
      }
      if (fiber.parent.fiber === fiber) return
    }
  }

  private async dir(name: string, scope: unknown = 'global', afterLogin: boolean): Promise<string> {
    let dir: string
    if (scope === 'global') {
      dir = this.sharedDir(name)
    } else if (scope === 'account') {
      if (!afterLogin) {
        throw new Error(`ctx.storage.dir('account') only works after login: add 'account' to the inject of ${name}, or call it inside ctx.inject(['account'], ...)`)
      }
      const uin = this.uin()
      if (!uin) throw new Error(`ctx.storage.dir('account'): no account is logged in`)
      dir = path.join(this.root, dataKey(name), uin)
    } else {
      throw new TypeError(`ctx.storage.dir(): unknown scope ${JSON.stringify(scope)}, expected 'global' or 'account'`)
    }
    await mkdir(dir, { recursive: true })
    return dir
  }
}
