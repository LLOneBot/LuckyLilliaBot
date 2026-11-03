import { realpathSync } from 'node:fs'
import path from 'node:path'
import { Context } from 'cordis'
import { compareVersions } from 'compare-versions'
import { Context as HonoContext, Hono } from 'hono'
import type { ReloadResult } from '../../../host'
import { SDK_PACKAGE, sdkIncompatibility } from '../../../host/manifest'
import { SHARED_SPECIFIERS } from '../../../host/resolve-hook'
import { Installer, type InstallResult } from './installer'
import { PackageVersion, pickVersion, Registry, RegistryError, type SearchItem } from './registry'
import { MarketSchema, type MarketSettings } from './settings'

export interface InstalledPackage {
  name: string
  version: string
  description?: string
  /** In the plugin root the market installs into, as a directory of its own: it may update and remove it */
  managed: boolean
  root: string
}

export interface UpdateInfo {
  latest?: string
  /** The newest version that runs on this bot, when newer than the installed one */
  update?: string
  /** Why the latest one does not run here */
  blocked?: string
  deprecated?: string
  error?: string
}

export interface InstallOutcome extends InstallResult {
  previous?: string
  /** The package's entries; a first install has one, switched off */
  entries: string[]
  /** How the running entries took the new version */
  reload?: ReloadResult | { status: 'failed'; reason: string }
}

/** A refusal the WebUI shows as it is */
export class MarketError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message)
  }
}

const PAGE_SIZE = 20

export class Market {
  readonly installer: Installer
  private queue: Promise<unknown> = Promise.resolve()

  /** `root`: the plugin directory it installs into, as a real path */
  constructor(private readonly ctx: Context, readonly registry: Registry, root: string) {
    this.installer = new Installer(registry, root, new Set(SHARED_SPECIFIERS))
  }

  installed(): InstalledPackage[] {
    return this.ctx.plugins.packageList().map(pkg => ({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      managed: this.manages(pkg.name, pkg.root),
      root: pkg.root,
    })).sort((a, b) => Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name))
  }

  async updates(): Promise<Record<string, UpdateInfo>> {
    const result: Record<string, UpdateInfo> = {}
    await Promise.all(this.installed().filter(pkg => pkg.managed).map(async (pkg) => {
      try {
        const document = await this.registry.packument(pkg.name)
        const latest = pickVersion(document)
        const runnable = pickVersion(document, 'latest', version => this.runsHere(version))
        const info: UpdateInfo = { latest: latest?.version }
        if (runnable && newer(runnable.version, pkg.version)) info.update = runnable.version
        if (latest && latest !== runnable) info.blocked = this.incompatibility(latest)
        const deprecated = document.versions[pkg.version]?.deprecated
        if (deprecated) info.deprecated = deprecated
        result[pkg.name] = info
      } catch (e) {
        result[pkg.name] = { error: (e as Error).message }
      }
    }))
    return result
  }

  async search(text: string, page: number): Promise<{ total: number; items: (SearchItem & { installed?: string })[] }> {
    const installed = new Map(this.ctx.plugins.packageList().map(pkg => [pkg.name, pkg.version]))
    const result = await this.registry.search(text, (page - 1) * PAGE_SIZE, PAGE_SIZE)
    return { total: result.total, items: result.items.map(item => ({ ...item, installed: installed.get(item.name) })) }
  }

  /** Without `version`, the newest that runs on this bot. One install or removal at a time. */
  install(name: string, version?: string): Promise<InstallOutcome> {
    return this.serial(async () => {
      this.assertManageable(name)
      const document = await this.registry.packument(name, true)
      const chosen = version ? pickVersion(document, version) : pickVersion(document, 'latest', candidate => this.runsHere(candidate))
      if (!chosen) {
        if (version) throw new MarketError(`${name} has no version ${version}`, 404)
        const latest = pickVersion(document)
        throw new MarketError(`no version of ${name} runs on this bot${latest ? `: ${this.incompatibility(latest)}` : ''}`, 409)
      }
      if (!chosen.llbot || typeof chosen.llbot !== 'object') {
        throw new MarketError(`${name}@${chosen.version} is no LuckyLillia plugin: its package.json has no llbot field`)
      }
      const previous = this.ctx.plugins.packageList().find(pkg => pkg.name === name)?.version
      const result = await this.installer.install(chosen)
      this.ctx.logger('market').info(`installed ${name}@${chosen.version}${previous ? ` (was ${previous})` : ''}`)
      await this.ctx.plugins.scan()
      const entries = this.ctx.plugins.list().filter(status => status.name === name)
      const outcome: InstallOutcome = { ...result, previous, entries: entries.map(entry => entry.id) }
      // The whole package reloads, every entry of it
      const running = entries.find(entry => !entry.disabled)
      if (previous && running) {
        outcome.reload = await this.ctx.plugins.reload(running.id).catch(e => ({ status: 'failed' as const, reason: (e as Error).message }))
      }
      return outcome
    })
  }

  /** Deletes the package, its entries with their settings, and the trust and approvals the user gave it. */
  uninstall(name: string): Promise<{ removed: string[] }> {
    return this.serial(async () => {
      this.assertManageable(name)
      if (!this.ctx.plugins.packageList().some(pkg => pkg.name === name)) throw new MarketError(`${name} is not installed`, 404)
      await this.installer.uninstall(name)
      const removed = this.ctx.plugins.list().filter(status => status.name === name).map(status => status.id)
      for (const id of removed) await this.ctx.plugins.remove(id)
      await this.ctx.plugins.forget(name)
      await this.ctx.plugins.scan()
      this.ctx.logger('market').info(`uninstalled ${name}`)
      return { removed }
    })
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => {})
    return result
  }

  private assertManageable(name: string) {
    if (!this.installer.target(name)) throw new MarketError(`invalid package name ${name}`)
    const pkg = this.ctx.plugins.packageList().find(pkg => pkg.name === name)
    if (pkg && !this.manages(pkg.name, pkg.root)) {
      throw new MarketError(`${name} is at ${pkg.root}, outside the market's directory ${this.installer.root}; it leaves that copy alone`, 409)
    }
  }

  private manages(name: string, root: string): boolean {
    const target = this.installer.target(name)
    return !!target && path.relative(target, root) === ''
  }

  private runsHere(version: PackageVersion): boolean {
    return !this.incompatibility(version)
  }

  private incompatibility(version: PackageVersion): string | undefined {
    const problem = sdkIncompatibility(version.peerDependencies?.[SDK_PACKAGE], this.ctx.plugins.hostSdk())
    return problem && `${version.version} ${problem}`
  }
}

function newer(a: string, b: string): boolean {
  try {
    return compareVersions(a, b) > 0
  } catch {
    return false
  }
}

export const name = 'market'
export const inject = ['plugins', 'http']
export const Config = MarketSchema

export function apply(ctx: Context, config: MarketSettings) {
  const first = ctx.plugins.config.roots[0]
  if (!first) {
    ctx.logger('market').warn('the plugin service has no plugin directory to install into')
    return
  }
  // Scanned packages carry real paths
  let root = path.resolve(first)
  try {
    root = realpathSync(root)
  } catch {
    // created by the first install
  }
  const market = new Market(ctx, new Registry(config.registry, config.search, (url, init) => ctx.http.fetch(url, init)), root)
  market.installer.cleanup().catch(e => ctx.logger('market').warn(e))
  ctx.inject(['webuiServer'], (ctx) => {
    ctx.webuiServer.route('/api/market', new Hono().route('/api/market', createMarketRoutes(ctx, market)))
  })
}

export function createMarketRoutes(ctx: Context, market: Market): Hono {
  const router = new Hono()

  const respond = async (c: HonoContext, task: () => Promise<unknown> | unknown) => {
    try {
      return c.json({ success: true, data: (await task()) ?? null })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (e instanceof MarketError) return c.json({ success: false, message }, e.status)
      if (e instanceof RegistryError) return c.json({ success: false, message }, e.status === 404 ? 404 : 502)
      ctx.logger('market').warn(e)
      return c.json({ success: false, message }, 500)
    }
  }

  const body = async (c: HonoContext) => {
    const value = await c.req.json().catch(() => undefined) as Record<string, unknown> | undefined
    const name = value?.name
    if (typeof name !== 'string' || !name) throw new MarketError('name is required')
    const version = value?.version
    if (version !== undefined && (typeof version !== 'string' || !version)) throw new MarketError('version should be a non-empty string')
    return { name, version: version as string | undefined }
  }

  router.get('/search', c => respond(c, () => {
    const page = Math.max(1, Math.floor(Number(c.req.query('page') ?? 1)) || 1)
    return market.search(c.req.query('q')?.trim() ?? '', page)
  }))
  router.get('/installed', c => respond(c, () => market.installed()))
  router.get('/updates', c => respond(c, () => market.updates()))
  router.post('/install', c => respond(c, async () => {
    const { name, version } = await body(c)
    return market.install(name, version)
  }))
  router.post('/uninstall', c => respond(c, async () => market.uninstall((await body(c)).name)))

  return router
}
