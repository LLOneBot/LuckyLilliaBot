import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'cordis'
import { compareVersions } from 'compare-versions'
import { Context as HonoContext, Hono } from 'hono'
import type { PluginCategory } from '@luckylillia/plugin-sdk'
import type { PluginStatus, ReloadResult } from '../../../host'
import { matchesPluginVersion, parsePluginDependencies, PLUGIN_CATEGORIES, SDK_PACKAGE, sdkIncompatibility } from '../../../host/manifest'
import { SHARED_SPECIFIERS } from '../../../host/resolve-hook'
import { Catalog, type CatalogEntry, type CatalogSnapshot } from './catalog'
import { ArchiveError, readLocalPackage } from './archive'
import { Installer, type InstallResult, type PackageSource } from './installer'
import { PackageVersion, type PackageManifest, type Packument, Registry, RegistryError } from './registry'
import { MarketSchema, type MarketSettings } from './settings'
import { withLocalUpload } from './upload'
import { matchesOrigin, type PluginOrigin } from './origin'

export interface InstalledPackage {
  name: string
  title?: string
  version: string
  description?: string
  /** In the plugin root the market installs into, as a directory of its own: it may update and remove it */
  managed: boolean
  root: string
  /** Stable builtin:* entry name; bundled packages can be updated but never uninstalled. */
  builtin?: string
  activeVersion?: string
  restartRequired?: boolean
  error?: string
}

export interface UpdateInfo {
  /** The exact version currently listed in the catalog. */
  latest?: string
  /** The catalog version, only when compatible and newer than the installed one. */
  update?: string
  /** Why the catalog entry cannot be used for an update. */
  blocked?: string
  deprecated?: string
  error?: string
}

export interface InstallOutcome extends InstallResult {
  title?: string
  previous?: string
  /** The package's entries; a first install has one, switched off */
  entries: string[]
  /** How the running entries took the new version */
  reload?: ReloadResult | { status: 'failed'; reason: string }
  /** Other plugin packages installed first, in dependency order. Reused packages are not included. */
  dependencies?: InstallOutcome[]
}

interface PlannedPlugin {
  name: string
  version: string
  dependencies: Record<string, string>
  /** Absent when reusing a package from the host's scanned plugin list. */
  source?: PackageSource
}

interface PluginRequirement {
  name: string
  range: string
  parent: string
}

/** A refusal the WebUI shows as it is */
export class MarketError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message)
  }
}

const PAGE_SIZE = 20

/** Use the same declared title and locale preference as the plugin card. */
function entryTitle(entry?: Pick<PluginStatus, 'title' | 'manifest'>): string | undefined {
  const title = entry?.title ?? entry?.manifest.title
  return typeof title === 'string' ? title.trim() || undefined : title?.zh ?? title?.['zh-CN'] ?? title?.en
}

export class Market {
  readonly installer: Installer
  private queue: Promise<unknown> = Promise.resolve()

  /** `root`: the plugin directory it installs into, as a real path */
  constructor(private readonly ctx: Context, readonly registry: Registry, root: string, readonly catalog = new Catalog(registry)) {
    this.installer = new Installer(registry, root, new Set(SHARED_SPECIFIERS))
  }

  installed(): InstalledPackage[] {
    const titles = new Map(this.ctx.plugins.list().map(entry => [entry.name, entryTitle(entry)]))
    return [...this.ctx.plugins.packageList().map(pkg => ({
      name: pkg.name,
      title: titles.get(pkg.name),
      version: pkg.version,
      description: pkg.description,
      managed: this.manages(pkg.name, pkg.root),
      root: pkg.root,
    })), ...this.ctx.plugins.builtinPackageList().map(pkg => ({
      name: pkg.name, title: titles.get(pkg.entryName), version: pkg.version,
      managed: !pkg.root || this.manages(pkg.name, pkg.root),
      root: pkg.root ?? this.installer.target(pkg.name)!,
      builtin: pkg.entryName, activeVersion: pkg.activeVersion, restartRequired: pkg.restartRequired, error: pkg.error,
    }))].sort((a, b) => Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name))
  }

  private builtin(name: string) {
    return this.ctx.plugins.builtinPackageList().find(pkg => pkg.name === name)
  }

  private installedPackages() {
    return [...this.ctx.plugins.packageList(), ...this.ctx.plugins.builtinPackageList()]
  }

  async updates(): Promise<Record<string, UpdateInfo>> {
    const result: Record<string, UpdateInfo> = {}
    const installed = this.installed().filter(pkg => pkg.managed)
    if (!installed.length) return result
    const catalog = await this.catalog.load()
    // Each candidate has its own dependency plan, but they share registry metadata for this check.
    const documents = new Map<string, Promise<Packument>>()
    const packument = (name: string) => {
      let document = documents.get(name)
      if (!document) documents.set(name, document = this.registry.packument(name, true))
      return document
    }
    await Promise.all(installed.map(async (pkg) => {
      const info: UpdateInfo = {}
      result[pkg.name] = info
      try {
        const entry = catalog.get(pkg.name)
        if (!entry) {
          info.blocked = '该插件已不在当前市场目录中，无法从市场更新'
          return
        }
        info.latest = entry.version
        const document = await packument(pkg.name)
        const deprecated = document.versions[pkg.version]?.deprecated
        if (deprecated) info.deprecated = deprecated
        const approved = await this.catalogVersion(entry, document)
        const problem = this.builtin(pkg.name) && !newer(entry.version, pkg.version) ? undefined : this.incompatibility(approved)
        if (problem) info.blocked = problem
        else {
          const main = this.planned({ manifest: approved }, pkg.name)
          if (newer(entry.version, pkg.version)) {
            await this.planPlugins(main, catalog, packument)
            info.update = entry.version
          }
        }
      } catch (e) {
        if (e instanceof MarketError || e instanceof RegistryError && e.status === 404) info.blocked = e.message
        else info.error = (e as Error).message
      }
    }))
    return result
  }

  async search(text: string, page: number, origin: PluginOrigin = 'all', category: PluginCategory | 'all' = 'all'): Promise<{
    total: number
    categories: Record<PluginCategory, number>
    items: (CatalogEntry & { installed?: string; builtin?: string })[]
  }> {
    const installed = new Map(this.installedPackages().map(pkg => [pkg.name, pkg.version]))
    const builtins = new Map(this.ctx.plugins.builtinPackageList().map(pkg => [pkg.name, pkg.entryName]))
    const terms = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    const catalog = await this.catalog.load()
    const matching = [...catalog.values()].filter(item => {
      if (!matchesOrigin(builtins.has(item.name), origin)) return false
      const searchable = [item.name, item.title, item.description, item.author.name, item.repository].join(' ').toLocaleLowerCase()
      return terms.every(term => searchable.includes(term))
    })
    // Count every category for the current text and origin, before category filtering or pagination.
    const categories = Object.fromEntries(PLUGIN_CATEGORIES.map(key => [key, 0])) as Record<PluginCategory, number>
    for (const item of matching) categories[item.category ?? 'other']++
    const items = category === 'all' ? matching : matching.filter(item => (item.category ?? 'other') === category)
    const start = (Math.max(1, page) - 1) * PAGE_SIZE
    return { total: items.length, categories, items: items.slice(start, start + PAGE_SIZE).map(item => ({
      ...item, installed: installed.get(item.name), ...builtins.has(item.name) ? { builtin: builtins.get(item.name) } : {},
    })) }
  }

  /** A single directory snapshot for client-side filtering alongside the host's installed entries. */
  async catalogItems(): Promise<(CatalogEntry & { builtin?: string })[]> {
    const catalog = await this.catalog.load()
    const builtins = new Map(this.ctx.plugins.builtinPackageList().map(pkg => [pkg.name, pkg.entryName]))
    return [...catalog.values()].map(item => ({
      ...item, ...builtins.has(item.name) ? { builtin: builtins.get(item.name) } : {},
    }))
  }

  /** Only the catalog's exact version is installable. One install or removal at a time. */
  install(name: string, version?: string): Promise<InstallOutcome> {
    return this.serial(() => this.installCatalog(name, version))
  }

  /** A manual update must still refer to the installed and target versions the user saw. */
  update(name: string, version: string, currentVersion: string): Promise<InstallOutcome> {
    return this.serial(async () => {
      this.assertManageable(name)
      const installed = this.installedPackages().find(pkg => pkg.name === name)
      if (!installed) throw new MarketError(`${name} is no longer installed; refresh the plugin market`, 409)
      if (installed.version !== currentVersion) {
        throw new MarketError(`${name} is now ${installed.version}, not ${currentVersion}; refresh the plugin market`, 409)
      }
      if (!newer(version, installed.version)) {
        throw new MarketError(`${name}@${version} is not newer than installed version ${installed.version}`, 409)
      }
      return this.installCatalog(name, version)
    })
  }

  private async installCatalog(name: string, version?: string): Promise<InstallOutcome> {
    this.assertManageable(name)
    // Keep a single catalog snapshot for the requested plugin and its whole dependency graph.
    const catalog = await this.catalog.load()
    const entry = this.assertListed(catalog, name)
    if (version !== undefined && version !== entry.version) {
      throw new MarketError(`${name}@${version} is not the catalog version ${entry.version}; refresh the plugin market`, 409)
    }
    const chosen = await this.catalogVersion(entry)
    const builtin = this.builtin(name)
    if (builtin && !newer(chosen.version, builtin.version)) {
      throw new MarketError(`${name}@${chosen.version} is not newer than installed version ${builtin.version}`, 409)
    }
    const problem = this.incompatibility(chosen)
    if (problem) throw new MarketError(`${name}@${entry.version} cannot run on this bot: ${problem}`, 409)
    const plan = await this.planPlugins(this.planned({ manifest: chosen }, name), catalog)
    return this.installPlan(plan)
  }

  /** Local uploads need no catalog approval; missing plugin dependencies still come from its pinned versions. */
  installLocal(archive: string, filename: string): Promise<InstallOutcome> {
    return this.serial(async () => {
      await mkdir(this.installer.root, { recursive: true })
      const directory = await mkdtemp(path.join(this.installer.root, '.market-local-'))
      try {
        const source = await readLocalPackage(archive, filename, directory)
        const { name, version } = source.manifest
        if (this.builtin(name)) throw new MarketError('内置插件只能从插件市场更新，不能用本地包覆盖', 409)
        this.assertManageable(name)
        const problem = this.incompatibility(source.manifest)
        if (problem) throw new MarketError(`${name}@${version} cannot run on this bot: ${problem}`, 409)
        return await this.installPlan(await this.planPlugins(this.planned(source, name)))
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    })
  }

  private async installPlan(plan: PlannedPlugin[]): Promise<InstallOutcome> {
    const outcomes: InstallOutcome[] = []
    for (const item of plan) {
      if (item.source) outcomes.push(await this.installPackage(item.source))
    }
    const outcome = outcomes.pop()!
    if (outcomes.length) {
      outcome.dependencies = outcomes
      outcome.scripts = [...new Set([...outcome.scripts, ...outcomes.flatMap(item => item.scripts)])]
      outcome.skipped = [...new Set([...outcome.skipped, ...outcomes.flatMap(item => item.skipped)])]
      outcome.packages += outcomes.reduce((total, item) => total + item.packages, 0)
    }
    return outcome
  }

  private assertListed(catalog: CatalogSnapshot, name: string): CatalogEntry {
    const entry = catalog.get(name)
    if (!entry) throw new MarketError(`${name} is not found in the plugin market list; it cannot be installed`, 404)
    return entry
  }

  private async catalogVersion(entry: CatalogEntry, document?: Packument): Promise<PackageVersion> {
    document ??= await this.registry.packument(entry.name, true)
    const version = Object.hasOwn(document.versions, entry.version) ? document.versions[entry.version] : undefined
    if (!version) throw new MarketError(`${entry.name}: catalog version ${entry.version} is unavailable from the npm registry`, 404)
    if (document.name !== entry.name || version.name !== entry.name || version.version !== entry.version) {
      throw new MarketError(`the registry returned a different package or version for ${entry.name}@${entry.version}`)
    }
    return version
  }

  private planned(source: PackageSource, name: string): PlannedPlugin {
    const version = source.manifest
    if (version.name !== name) throw new MarketError(`the registry returned ${version.name} when ${name} was requested`)
    if (!version.llbot || typeof version.llbot !== 'object' || Array.isArray(version.llbot)) {
      throw new MarketError(`${name}@${version.version} is no LuckyLillia plugin: its package.json has no llbot field`)
    }
    try {
      return {
        name, version: version.version, source,
        dependencies: parsePluginDependencies((version.llbot as { dependencies?: unknown }).dependencies),
      }
    } catch (e) {
      throw new MarketError(`${name}@${version.version}: ${(e as Error).message}`)
    }
  }

  /** Resolve the complete plugin graph before writing anything. npm library dependencies stay with Installer. */
  private async planPlugins(
    main: PlannedPlugin,
    catalog?: CatalogSnapshot,
    packument = (name: string) => this.registry.packument(name, true),
  ): Promise<PlannedPlugin[]> {
    const installed = new Map(this.installedPackages().map(pkg => [pkg.name, pkg]))
    const installedRequirements = new Map<string, PluginRequirement[]>()
    for (const pkg of installed.values()) {
      // The requested package is being replaced; its old requirements do not constrain its new version.
      if (pkg.name === main.name) continue
      for (const [name, range] of Object.entries(parsePluginDependencies(pkg.manifest.dependencies))) {
        installedRequirements.set(name, [...installedRequirements.get(name) ?? [], { name, range, parent: pkg.name }])
      }
    }
    const requirementsOf = (pkg: PlannedPlugin): PluginRequirement[] => Object.entries(pkg.dependencies)
      .map(([name, range]) => ({ name, range, parent: pkg.name }))
    let attempts = 0
    let conflict = 'plugin dependencies have incompatible version requirements'
    const resolve = async (pending: PluginRequirement[], selected: Map<string, PlannedPlugin>): Promise<Map<string, PlannedPlugin> | undefined> => {
      if (++attempts > 2048 || selected.size > 128) throw new MarketError('plugin dependency graph is too large or complex', 409)
      if (!pending.length) return selected
      const [requirement, ...rest] = pending
      const { name, range, parent } = requirement
      const selectedPackage = selected.get(name)
      if (selectedPackage) {
        if (matchesPluginVersion(selectedPackage.version, range)) return resolve(rest, selected)
        conflict = `${parent} needs ${name}@${range}, which conflicts with ${selectedPackage.version}`
        return
      }
      const ranges = [range, ...rest.filter(dep => dep.name === name).map(dep => dep.range),
        ...(installedRequirements.get(name) ?? []).map(dep => dep.range)]
      const accepts = (version: string) => ranges.every(range => matchesPluginVersion(version, range))
      const reuse = installed.get(name)
      if (reuse) {
        if (!accepts(reuse.version)) {
          conflict = `${parent} needs ${name}@${ranges.join(' and ')}, but ${reuse.version} is already installed; update that plugin first`
          return
        }
        const item: PlannedPlugin = { name, version: reuse.version, dependencies: parsePluginDependencies(reuse.manifest.dependencies) }
        const next = new Map(selected).set(name, item)
        return resolve([...rest, ...requirementsOf(item)], next)
      }
      this.assertManageable(name)
      // A self-contained local package also installs while the market catalog is unavailable.
      catalog ??= await this.catalog.load()
      const entry = this.assertListed(catalog, name)
      if (!accepts(entry.version)) {
        conflict = `${parent} needs ${name}@${ranges.join(' and ')}, but the market catalog only lists ${entry.version}`
        return
      }
      const candidate = await this.catalogVersion(entry, await packument(name))
      const problem = this.incompatibility(candidate)
      if (problem) {
        conflict = `${parent} needs ${name}, but its catalog version cannot run on this bot: ${problem}`
        return
      }
      const item = this.planned({ manifest: candidate }, name)
      return resolve([...rest, ...requirementsOf(item)], new Map(selected).set(name, item))
    }
    const selected = await resolve(requirementsOf(main), new Map([[main.name, main]]))
    if (!selected) throw new MarketError(conflict, 409)

    // Updating the requested plugin must also respect the requirements of plugins already installed.
    for (const pkg of installed.values()) {
      if (selected.get(pkg.name)?.source) continue
      for (const [name, range] of Object.entries(parsePluginDependencies(pkg.manifest.dependencies))) {
        const changed = selected.get(name)
        if (changed?.source && !matchesPluginVersion(changed.version, range)) {
          throw new MarketError(`${pkg.name} needs ${name}@${range}; installing ${changed.version} would break that dependency`, 409)
        }
      }
    }
    const ordered: PlannedPlugin[] = []
    const visited = new Set<string>()
    const visit = (name: string, ancestors: string[]) => {
      if (ancestors.includes(name)) throw new MarketError(`circular plugin dependencies: ${[...ancestors, name].join(' -> ')}`, 409)
      if (visited.has(name)) return
      const item = selected.get(name)!
      for (const dependency of Object.keys(item.dependencies)) visit(dependency, [...ancestors, name])
      visited.add(name)
      ordered.push(item)
    }
    visit(main.name, [])
    return ordered
  }

  private async installPackage(source: PackageSource): Promise<InstallOutcome> {
    const chosen = source.manifest
    const { name } = chosen
    const builtin = this.builtin(name)
    const previous = this.installedPackages().find(pkg => pkg.name === name)?.version
    const result = await this.installer.install(source)
    if (builtin) {
      await this.ctx.plugins.approveBuiltinPackage(name, chosen.version)
      this.ctx.logger('market').info(`updated builtin ${name}@${chosen.version}; restart required`)
      const entries = this.ctx.plugins.list().filter(entry => entry.name === builtin.entryName)
      return {
        ...result, previous, title: entryTitle(entries[0]),
        entries: entries.map(entry => entry.id),
        reload: { status: 'restart-required', reason: '内置插件更新将在重启 Bot 后生效' },
      }
    }
    this.ctx.logger('market').info(`installed ${name}@${chosen.version}${previous ? ` (was ${previous})` : ''}`)
    await this.ctx.plugins.scan()
    const entries = this.ctx.plugins.list().filter(status => status.name === name)
    const outcome: InstallOutcome = { ...result, previous, title: entryTitle(entries[0]), entries: entries.map(entry => entry.id) }
    const running = entries.find(entry => !entry.disabled)
    if (previous && running) {
      outcome.reload = await this.ctx.plugins.reload(running.id).catch(e => ({ status: 'failed' as const, reason: (e as Error).message }))
    }
    return outcome
  }

  /** Removes the package and trust; entry configurations can be retained for a later installation. */
  uninstall(name: string, options: { keepConfig?: boolean } = {}): Promise<{ removed: string[] }> {
    return this.serial(async () => {
      if (this.builtin(name)) throw new MarketError('内置插件不能卸载', 409)
      this.assertManageable(name)
      if (!this.ctx.plugins.packageList().some(pkg => pkg.name === name)) throw new MarketError(`${name} is not installed`, 404)
      await this.installer.uninstall(name)
      const removed = await this.ctx.plugins.removePackage(name, options)
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
    const builtin = this.builtin(name)
    if (builtin && !builtin.root) return
    const pkg = builtin ?? this.ctx.plugins.packageList().find(pkg => pkg.name === name)
    if (pkg?.root && !this.manages(pkg.name, pkg.root)) {
      throw new MarketError(`${name} is at ${pkg.root}, outside the market's directory ${this.installer.root}; it leaves that copy alone`, 409)
    }
  }

  private manages(name: string, root: string): boolean {
    const target = this.installer.target(name)
    return !!target && path.relative(target, root) === ''
  }

  private incompatibility(version: PackageManifest): string | undefined {
    const builtinProblem = this.ctx.plugins.checkBuiltinPackage(version.name, version)
    if (builtinProblem) return builtinProblem
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
  const registry = new Registry(config.registry, (url, init) => ctx.http.fetch(url, init))
  const market = new Market(ctx, registry, root, new Catalog(registry, config.catalog))
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
      if (e instanceof ArchiveError) return c.json({ success: false, message }, e.status)
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
    return { name, version: version as string | undefined, currentVersion: value?.currentVersion }
  }

  router.get('/search', c => respond(c, () => {
    const page = Math.max(1, Math.floor(Number(c.req.query('page') ?? 1)) || 1)
    const origin = c.req.query('origin') ?? 'all'
    if (origin !== 'all' && origin !== 'builtin' && origin !== 'third-party') throw new MarketError('origin must be all, builtin or third-party')
    const category = c.req.query('category') ?? 'all'
    if (category !== 'all' && !PLUGIN_CATEGORIES.includes(category as PluginCategory)) throw new MarketError(`category must be all or one of ${PLUGIN_CATEGORIES.join(', ')}`)
    return market.search(c.req.query('q')?.trim() ?? '', page, origin, category as PluginCategory | 'all')
  }))
  router.get('/catalog', c => respond(c, () => market.catalogItems()))
  router.get('/installed', c => respond(c, () => market.installed()))
  router.get('/updates', c => respond(c, () => market.updates()))
  router.post('/install', c => respond(c, async () => {
    const { name, version } = await body(c)
    return market.install(name, version)
  }))
  router.post('/update', c => respond(c, async () => {
    const { name, version, currentVersion } = await body(c)
    if (!version) throw new MarketError('version is required')
    if (typeof currentVersion !== 'string' || !currentVersion) throw new MarketError('currentVersion is required')
    return market.update(name, version, currentVersion)
  }))
  router.post('/install-local', c => respond(c, () => withLocalUpload(c.req.raw, market.installer.root, (archive, filename) => market.installLocal(archive, filename))))
  router.post('/uninstall', c => respond(c, async () => {
    const value = await c.req.json().catch(() => undefined) as Record<string, unknown> | undefined
    if (typeof value?.name !== 'string' || !value.name) throw new MarketError('name is required')
    if (value.keepConfig !== undefined && typeof value.keepConfig !== 'boolean') throw new MarketError('keepConfig must be a boolean')
    return market.uninstall(value.name, { keepConfig: value.keepConfig as boolean | undefined })
  }))

  return router
}
