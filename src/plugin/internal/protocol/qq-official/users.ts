import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'cordis'

const LIMIT = 20_000
const SAVE_DELAY = 5_000

export interface UserInfo {
  name?: string
  avatar?: string
}

export interface UserNamesOptions {
  appId: string
  /** Keep the names on disk */
  persist: boolean
  /** A third-party service that names an openid (Koishi adapter-qq-crack uses https://oiapi.net/api/Openid) */
  lookupApi?: string
}

/**
 * Names seen in events, by platform and user id: most events leave them out (C2C messages, interactions, member
 * events), so they are filled in from here. Koishi adapter-qq-crack keeps them in Koishi's user table; here they
 * go to a file in the plugin's data directory.
 */
export class UserNames {
  private names = new Map<string, string>()
  private file?: string
  private disposeSave?: () => void
  private logger

  constructor(private ctx: Context, private options: UserNamesOptions) {
    this.logger = ctx.logger('qq-official')
  }

  async load() {
    if (!this.options.persist) return
    let storage: { dir(): Promise<string> } | undefined
    try {
      storage = (this.ctx as Context & { storage?: { dir(): Promise<string> } }).storage
    } catch {
      // Outside a plugin entry (tests) there is no data directory
    }
    if (!storage) return
    const safe = this.options.appId.replace(/[^\w-]/g, '_')
    try {
      this.file = path.join(await storage.dir(), `usernames-${safe}.json`)
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      for (const [key, name] of Object.entries(data)) {
        if (typeof name === 'string' && !this.names.has(key)) this.names.set(key, name)
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('读取用户名缓存失败: %s', (e as Error).message)
    }
  }

  get(platform: string, userId: string): string | undefined {
    return this.names.get(`${platform}:${userId}`)
  }

  set(platform: string, userId: string, name: string | undefined) {
    const key = `${platform}:${userId}`
    name = name?.trim()
    if (!userId || !name || this.names.get(key) === name) return
    this.names.delete(key)
    this.names.set(key, name)
    while (this.names.size > LIMIT) this.names.delete(this.names.keys().next().value!)
    this.scheduleSave()
  }

  /** Asks the lookup service, when one is set. */
  async lookup(userId: string): Promise<UserInfo | undefined> {
    const api = this.options.lookupApi?.trim()
    if (!api || !userId) return
    try {
      const url = new URL(api)
      url.searchParams.set('appid', this.options.appId)
      url.searchParams.set('openid', userId)
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const body = await res.json() as { code?: number; data?: { nickname?: string; avatar?: string } }
      if (body?.code !== 1 || !body.data) return
      return { name: body.data.nickname || undefined, avatar: body.data.avatar || undefined }
    } catch (e) {
      this.logger.warn('查询用户昵称失败: %s', (e as Error).message)
    }
  }

  async dispose() {
    if (!this.disposeSave) return
    this.disposeSave()
    this.disposeSave = undefined
    await this.save()
  }

  private scheduleSave() {
    if (!this.file || this.disposeSave) return
    this.disposeSave = this.ctx.timeout(() => {
      this.disposeSave = undefined
      void this.save()
    }, SAVE_DELAY)
  }

  private async save() {
    if (!this.file) return
    try {
      await mkdir(path.dirname(this.file), { recursive: true })
      await writeFile(this.file, JSON.stringify(Object.fromEntries(this.names)))
    } catch (e) {
      this.logger.warn('保存用户名缓存失败: %s', (e as Error).message)
    }
  }
}
