import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber, FiberState, Inject, Plugin, Service, resolveConfig } from 'cordis'
import type { LLBotManifest } from '@luckylillia/plugin-sdk'
import {
  isInside, normalizeService, PluginPackage, readPluginPackage, scanPluginRoots, SDK_PACKAGE, sdkIncompatibility,
  ServiceDeclaration,
} from './manifest'
import { installPluginResolver, ResolverState, sharedSpecifierMap } from './resolve-hook'
import { newEntryId, PluginEntry, PluginsFile, PluginStore } from './store'
import { watchPluginRoots } from './watcher'

declare module 'cordis' {
  interface Context {
    plugins: PluginService
  }
  interface Events {
    /** @mode emit. `id` is undefined when the entry list itself changed. */
    'plugins/changed'(id?: string): void
  }
}

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

export interface PluginStatus {
  id: string
  name: string
  version?: string
  description?: string
  manifest: LLBotManifest
  disabled: boolean
  state: PluginState
  error?: string
  /** Injected services that are not available yet: why a pending plugin is waiting. */
  missingDeps: string[]
  reloadCount: number
  /** Undefined until the module has been imported once. */
  hasConfig?: boolean
  /** Ships with the bot: a single instance, configured in the bot settings rather than here. */
  builtin?: boolean
  /** A builtin the rest of the bot relies on, so it cannot be disabled. */
  core?: boolean
  /** Display name of a builtin. */
  title?: string
  /** Declared in the manifest, plus what the module injects and provides once it has been loaded. */
  service: ServiceDeclaration
  /** URL of the WebUI module; it changes whenever the package is reloaded, so the WebUI imports it afresh. */
  webui?: string
}

export interface DependencyInfo {
  name: string
  required: boolean
  /** Up right now, whoever provides it. */
  available: boolean
  /** Entry whose plugin provides it right now; absent when nothing does or the bot itself does. */
  provider?: string
  /** Other entries declaring that they implement it. */
  candidates: string[]
}

export interface DependencyReport {
  dependencies: DependencyInfo[]
  /** Services this entry implements that other enabled entries implement too. */
  conflicts: { service: string; with: string[] }[]
}

export interface BuiltinPlugin {
  /** Entry name; the `builtin:` prefix keeps it apart from package names. */
  name: string
  plugin: Plugin
  title: string
  manifest: LLBotManifest
  core?: boolean
}

export type ReloadResult = { status: 'reloaded' } | { status: 'restart-required'; reason: string }

export interface PluginDescription {
  /** schemastery `toJSON()` output, or null when the Config is absent or not schemastery. */
  schema: unknown
  defaults: unknown
  config: unknown
}

export class PluginNotFoundError extends Error {}

/** The action does not apply to this entry, e.g. disabling a core builtin. */
export class PluginForbiddenError extends Error {}

export interface ConfigIssue {
  message: string
  /** Keys from the config root down to the offending value. */
  path: string[]
}

/** A config the plugin's schema rejected; unlike cordis' ValidationError it keeps the issues. */
export class PluginConfigError extends TypeError {
  constructor(readonly issues: ConfigIssue[]) {
    super(issues.map(issue => issue.path.length ? `${issue.message} (at ${issue.path.join('.')})` : issue.message).join('; '))
  }
}

interface LoadedModule {
  plugin?: Plugin
  error?: string
}

interface Runtime {
  entry: PluginEntry
  fiber?: Fiber
  /** Import failures, or a failed reload while the previous fiber keeps running. */
  error?: string
  reloadCount: number
}

const SCAN_LOCK = '#scan'

const FIBER_STATES: Record<FiberState, PluginState> = {
  [FiberState.PENDING]: 'pending',
  [FiberState.LOADING]: 'loading',
  [FiberState.ACTIVE]: 'active',
  [FiberState.FAILED]: 'failed',
  [FiberState.DISPOSED]: 'disposed',
  [FiberState.UNLOADING]: 'loading',
}

class PluginService extends Service {
  static inject = ['timer']

  private store: PluginStore
  private data: PluginsFile = { version: 1, entries: [] }
  private packages = new Map<string, PluginPackage>()
  private modules = new Map<string, LoadedModule>()
  // Never reset: a repeated ?v= would be served from the ESM cache.
  private epochs = new Map<string, number>()
  private runtimes = new Map<string, Runtime>()
  private fiberIds = new WeakMap<Fiber, string>()
  private locks = new Map<string, Promise<unknown>>()
  private webuiVersions = new Map<string, number>()
  private resolver: ResolverState = { shared: new Map(), roots: [] }
  private resolverInstalled = false
  private sdkVersion?: string
  private builtins: Map<string, BuiltinPlugin>

  constructor(ctx: Context, public config: PluginService.Config) {
    super(ctx, 'plugins')
    this.store = new PluginStore(config.file)
    this.builtins = new Map((config.builtins ?? []).map(builtin => [builtin.name, builtin]))
  }

  async [Service.init]() {
    const disposers: (() => void)[] = []
    this.sdkVersion = hostSdkVersion()
    if (this.config.resolver !== false) {
      this.resolver.shared = sharedSpecifierMap()
      const uninstall = installPluginResolver(this.resolver)
      if (uninstall) {
        this.resolverInstalled = true
        disposers.push(uninstall)
      } else {
        this.ctx.logger.warn('module.registerHooks needs Node >= 22.15: plugins resolve shared packages by directory and cannot be hot reloaded')
      }
    }
    const { data, error } = await this.store.load()
    // On a parse error keep the broken file in place (don't let the reconcile-save below overwrite the
    // user's edit) and retry it next boot; run with reconciled builtins in memory so the bot still starts.
    if (error) this.ctx.logger.error(`invalid plugins.json, keeping the file and starting from defaults: ${error}`)
    this.data = data
    for (const entry of data.entries) this.runtimes.set(entry.id, { entry, reloadCount: 0 })
    if (this.reconcileBuiltins() && !error) await this.save()

    this.ctx.on('internal/status', fiber => this.onFiberStatus(fiber))
    await this.scan()
    for (const rt of this.runtimes.values()) {
      if (rt.entry.disabled) continue
      this.lock(rt.entry.name, () => this.start(rt)).catch(e => this.ctx.logger.error(e))
    }
    if (this.config.hmr || this.data.hmr) disposers.push(this.watch())
    return () => disposers.forEach(dispose => dispose())
  }

  list(): PluginStatus[] {
    return [...this.runtimes.values()].map(rt => this.status(rt))
  }

  get(id: string): PluginStatus {
    return this.status(this.runtime(id))
  }

  scan() {
    return this.lock(SCAN_LOCK, () => this.rescan())
  }

  async add(name: string, config?: unknown): Promise<PluginStatus> {
    if (this.builtins.has(name)) throw new PluginForbiddenError(`${name} is builtin and runs as a single instance`)
    if (!this.packages.has(name)) throw new PluginNotFoundError(`no plugin package named ${name}`)
    const rt = this.createEntry(name, false, config)
    await this.save()
    this.changed()
    await this.lock(name, () => this.start(rt))
    return this.status(rt)
  }

  async remove(id: string): Promise<void> {
    const rt = this.runtime(id)
    if (this.builtins.has(rt.entry.name)) {
      throw new PluginForbiddenError(`${rt.entry.name} is builtin and cannot be removed, disable it instead`)
    }
    await this.lock(rt.entry.name, () => this.stop(rt))
    this.runtimes.delete(id)
    this.data.entries = this.data.entries.filter(entry => entry.id !== id)
    await this.save()
    this.changed()
  }

  async enable(id: string): Promise<PluginStatus> {
    const rt = this.runtime(id)
    return this.lock(rt.entry.name, async () => {
      if (rt.entry.disabled) {
        delete rt.entry.disabled
        await this.save()
      }
      await this.start(rt)
      return this.status(rt)
    })
  }

  async disable(id: string): Promise<PluginStatus> {
    const rt = this.runtime(id)
    if (this.builtins.get(rt.entry.name)?.core) {
      throw new PluginForbiddenError(`${rt.entry.name} is part of the bot core and cannot be disabled`)
    }
    return this.lock(rt.entry.name, async () => {
      rt.entry.disabled = true
      await this.save()
      await this.stop(rt)
      return this.status(rt)
    })
  }

  /** Throws PluginConfigError, without touching the running instance, when the config is rejected. */
  async updateConfig(id: string, config: unknown): Promise<PluginStatus> {
    const rt = this.runtime(id)
    this.assertConfigurable(rt)
    return this.lock(rt.entry.name, async () => {
      const mod = await this.load(this.package(rt))
      if (!mod.plugin) throw new Error(mod.error)
      // fiber.update() only validates a loaded fiber; check up front so pending ones behave the same
      validateConfig(mod.plugin, config)
      rt.entry.config = config
      await this.save()
      const fiber = rt.fiber
      if (fiber) {
        rt.error = undefined
        // A failing apply() is reported through the fiber state, not thrown here
        await Promise.resolve(fiber.update(config, true)).catch(() => {})
        await fiber.await().catch(() => {})
      }
      return this.status(rt)
    })
  }

  async reload(id: string): Promise<ReloadResult> {
    const rt = this.runtime(id)
    const builtin = this.builtins.get(rt.entry.name)
    // Bundled with the bot, so there is no code to re-import: a restart picks up the current settings
    if (builtin) return this.lock(rt.entry.name, () => this.restartBuiltin(rt, builtin))
    if (!this.resolverInstalled) {
      return { status: 'restart-required', reason: 'module.registerHooks is unavailable (Node < 22.15), changed submodules would not be re-imported' }
    }
    return this.lock(rt.entry.name, () => this.reloadPackage(rt.entry.name))
  }

  /** Computed on request: whether each service is up depends on the whole app, not just this entry. */
  dependencies(id: string): DependencyReport {
    const rt = this.runtime(id)
    const own = this.serviceOf(rt)
    const implementers = new Map<string, Runtime[]>()
    for (const other of this.runtimes.values()) {
      if (other === rt) continue
      for (const name of this.serviceOf(other).implements) {
        implementers.set(name, [...implementers.get(name) ?? [], other])
      }
    }
    const describe = (name: string, required: boolean): DependencyInfo => {
      const impl = this.ctx.reflect._getImpl(name)
      return {
        name,
        required,
        available: this.isAvailable(name),
        provider: impl && this.entryOfFiber(impl.ctx.fiber),
        candidates: (implementers.get(name) ?? []).map(other => other.entry.id),
      }
    }
    return {
      dependencies: [
        ...own.required.map(name => describe(name, true)),
        ...own.optional.filter(name => !own.required.includes(name)).map(name => describe(name, false)),
      ],
      conflicts: own.implements.flatMap((name) => {
        const others = (implementers.get(name) ?? []).filter(other => !other.entry.disabled)
        return others.length ? [{ service: name, with: others.map(other => other.entry.id) }] : []
      }),
    }
  }

  /**
   * A file of a package's WebUI build, for `/plugin-webui/<key>/<version>/<file>`. Everything next to the
   * `llbot.webui` module and below it is served; nothing outside that directory is.
   */
  webuiAsset(key: string, file: string): string | undefined {
    const entry = this.packages.get(packageOfKey(key))?.webui
    if (!entry) return
    const dir = path.dirname(entry)
    const target = path.resolve(dir, file)
    return isInside(dir, target) ? target : undefined
  }

  /** Imports the module if it has not been loaded yet, so it also works for disabled entries. */
  async describe(id: string): Promise<PluginDescription> {
    const rt = this.runtime(id)
    this.assertConfigurable(rt)
    return this.lock(rt.entry.name, async () => {
      const mod = await this.load(this.package(rt))
      const Config = (mod.plugin as { Config?: { toJSON?: unknown } } | undefined)?.Config
      let defaults: unknown = {}
      try {
        defaults = resolveConfig({ Config } as Plugin.Runtime, undefined) ?? {}
      } catch {
        // required fields without defaults
      }
      return {
        schema: typeof Config?.toJSON === 'function' ? JSON.parse(JSON.stringify(Config)) : null,
        defaults,
        config: rt.entry.config ?? null,
      }
    })
  }

  private runtime(id: string): Runtime {
    const rt = this.runtimes.get(id)
    if (!rt) throw new PluginNotFoundError(`no plugin entry ${id}`)
    return rt
  }

  private package(rt: Runtime): PluginPackage {
    const pkg = this.packages.get(rt.entry.name)
    if (!pkg) throw new PluginNotFoundError(`plugin package ${rt.entry.name} is not installed`)
    return pkg
  }

  private assertConfigurable(rt: Runtime) {
    if (this.builtins.has(rt.entry.name)) {
      throw new PluginForbiddenError(`${rt.entry.name} is builtin and keeps its settings in the bot configuration`)
    }
  }

  /** One entry per builtin, enabled when first created; core builtins always run. Returns whether entries changed. */
  private reconcileBuiltins(): boolean {
    let changed = false
    for (const builtin of this.builtins.values()) {
      const [first, ...extra] = this.entriesOf(builtin.name)
      // Builtins provide named services, so a second instance would fight the first over them
      for (const rt of extra) {
        this.ctx.logger.warn(`dropped duplicate entry ${rt.entry.id} of ${builtin.name}`)
        this.runtimes.delete(rt.entry.id)
        this.data.entries = this.data.entries.filter(entry => entry !== rt.entry)
        changed = true
      }
      if (!first) {
        this.createEntry(builtin.name, false)
        changed = true
        continue
      }
      if (builtin.core && first.entry.disabled) {
        delete first.entry.disabled
        changed = true
      }
    }
    return changed
  }

  private async restartBuiltin(rt: Runtime, builtin: BuiltinPlugin): Promise<ReloadResult> {
    if (!rt.entry.disabled) {
      await this.stop(rt)
      await this.mount(rt, builtin.plugin)?.await().catch(() => {})
    }
    return { status: 'reloaded' }
  }

  private async rescan() {
    const { packages, errors } = await scanPluginRoots(this.config.roots)
    for (const { path: dir, error } of errors) this.ctx.logger.warn(`skipped ${dir}: ${error}`)
    const next = new Map<string, PluginPackage>()
    for (const pkg of packages) {
      const existing = next.get(pkg.name)
      if (existing) {
        this.ctx.logger.warn(`duplicate plugin ${pkg.name} at ${pkg.root}, keeping ${existing.root}`)
        continue
      }
      for (const warning of pkg.warnings) this.ctx.logger.warn(`${pkg.name}: ${warning}`)
      next.set(pkg.name, pkg)
    }
    const added = [...next.keys()].filter(name => !this.packages.has(name))
    const removed = [...this.packages.keys()].filter(name => !next.has(name))
    const changed = [...next.values()]
      .filter(pkg => {
        const old = this.packages.get(pkg.name)
        return old && (old.root !== pkg.root || old.main !== pkg.main || old.version !== pkg.version)
      })
      .map(pkg => pkg.name)
    this.packages = next
    this.resolver.roots = [...next.values()].map(pkg => pathToFileURL(pkg.root + path.sep).href)
    for (const name of [...changed, ...removed]) this.modules.delete(name)
    for (const name of changed) this.bumpWebui(name)
    for (const name of removed) {
      for (const rt of this.entriesOf(name)) await this.lock(name, () => this.stop(rt))
    }
    // First sighting of a package: list it, but leave running it to the user
    let created = false
    for (const name of added) {
      if (this.entriesOf(name).length) continue
      this.createEntry(name, true)
      created = true
    }
    if (created) await this.save()
    if (added.length || removed.length || changed.length) this.changed()
    return { added, changed, removed }
  }

  private async load(pkg: PluginPackage, fresh = false): Promise<LoadedModule> {
    const cached = this.modules.get(pkg.name)
    if (cached && !fresh) return cached
    const epoch = (this.epochs.get(pkg.name) ?? 0) + 1
    this.epochs.set(pkg.name, epoch)
    const loaded: LoadedModule = {}
    try {
      const exports = await import(`${pathToFileURL(pkg.main).href}?v=${epoch}`)
      const plugin = unwrapPlugin(exports)
      if (!plugin) throw new Error('the module exports no plugin: expected apply(), a function or a Service class')
      if (bundlesOwnCordis(plugin)) {
        throw new Error(`the plugin carries its own copy of cordis; build it with cordis and ${SDK_PACKAGE} marked external`)
      }
      loaded.plugin = plugin
    } catch (e) {
      loaded.error = errorText(e)
    }
    // A failed re-import must not evict the module the running fibers came from
    if (loaded.plugin || !cached) this.modules.set(pkg.name, loaded)
    return loaded
  }

  private async start(rt: Runtime) {
    if (rt.entry.disabled || rt.fiber || !this.runtimes.has(rt.entry.id)) return
    const builtin = this.builtins.get(rt.entry.name)
    if (builtin) {
      await this.mount(rt, builtin.plugin)?.await().catch(() => {})
      return
    }
    const pkg = this.packages.get(rt.entry.name)
    if (!pkg || this.incompatibility(pkg)) return this.changed(rt.entry.id)
    const mod = await this.load(pkg)
    if (!mod.plugin) {
      rt.error = mod.error
      return this.changed(rt.entry.id)
    }
    await this.mount(rt, mod.plugin)?.await().catch(() => {})
  }

  private mount(rt: Runtime, plugin: Plugin): Fiber | undefined {
    rt.error = undefined
    try {
      // ctx.plugin() hands back a thenable wrapper; internal/status reports the fiber itself
      const fiber = this.ctx.plugin(plugin, rt.entry.config).ctx.fiber
      this.fiberIds.set(fiber, rt.entry.id)
      rt.fiber = fiber
    } catch (e) {
      rt.error = errorText(e)
    }
    this.changed(rt.entry.id)
    return rt.fiber
  }

  private async stop(rt: Runtime) {
    const fiber = rt.fiber
    if (!fiber) return
    rt.fiber = undefined
    rt.error = undefined
    await fiber.dispose()
    this.changed(rt.entry.id)
  }

  /** Re-imports first and only swaps the running fibers once the new module loaded. */
  private async reloadPackage(name: string): Promise<ReloadResult> {
    const known = this.packages.get(name)
    if (!known) throw new PluginNotFoundError(`plugin package ${name} is not installed`)
    const pkg = (await readPluginPackage(known.root)) ?? known
    this.packages.set(name, pkg)
    this.bumpWebui(name)
    const mod = await this.load(pkg, true)
    const targets = this.entriesOf(name).filter(rt => !rt.entry.disabled)
    if (!mod.plugin) {
      for (const rt of targets) {
        if (!rt.fiber) continue
        rt.error = `reload failed, still running the previous version: ${mod.error}`
        this.changed(rt.entry.id)
      }
      throw new Error(`reload failed: ${mod.error}`)
    }
    for (const rt of targets) {
      await this.stop(rt)
      this.mount(rt, mod.plugin)
      rt.reloadCount++
    }
    await Promise.all(targets.map(rt => rt.fiber?.await().catch(() => {})))
    return { status: 'reloaded' }
  }

  private onFiberStatus(fiber: Fiber) {
    const id = this.fiberIds.get(fiber)
    const rt = id === undefined ? undefined : this.runtimes.get(id)
    if (!rt || rt.fiber !== fiber) return
    if (fiber.state === FiberState.FAILED) {
      // await() rethrows the error the fiber failed with
      fiber.await().catch((e) => {
        rt.error = errorText(e)
        this.changed(rt.entry.id)
      })
      return
    }
    if (fiber.state === FiberState.ACTIVE) rt.error = undefined
    this.changed(rt.entry.id)
  }

  private status(rt: Runtime): PluginStatus {
    const { entry, fiber } = rt
    const builtin = this.builtins.get(entry.name)
    const pkg = this.packages.get(entry.name)
    const mod = this.modules.get(entry.name)
    const status: PluginStatus = {
      id: entry.id,
      name: entry.name,
      version: pkg?.version,
      description: pkg?.description,
      manifest: builtin?.manifest ?? pkg?.manifest ?? {},
      disabled: !!entry.disabled,
      state: 'disposed',
      missingDeps: [],
      reloadCount: rt.reloadCount,
      hasConfig: builtin ? false : mod?.plugin ? !!mod.plugin.Config : undefined,
      service: this.serviceOf(rt),
      webui: pkg?.webui && webuiUrl(pkg, this.webuiVersions.get(pkg.name) ?? 0),
    }
    if (builtin) {
      Object.assign(status, { builtin: true, core: !!builtin.core, title: builtin.title })
    } else {
      if (!pkg) return { ...status, state: 'missing' }
      const incompatible = this.incompatibility(pkg)
      if (incompatible) return { ...status, state: 'incompatible', error: incompatible }
    }
    if (rt.error) status.error = rt.error
    if (!fiber) {
      if (status.error) status.state = 'failed'
      else if (!entry.disabled) status.state = 'loading'
      return status
    }
    status.state = FIBER_STATES[fiber.state]
    if (status.state === 'pending') status.missingDeps = this.missingDeps(fiber)
    return status
  }

  private bumpWebui(name: string) {
    this.webuiVersions.set(name, (this.webuiVersions.get(name) ?? 0) + 1)
  }

  private missingDeps(fiber: Fiber): string[] {
    return Object.keys(fiber.inject).filter(name => !this.isAvailable(name))
  }

  /** ctx.get() ignores Service.check, so a service gated on login would look available before it */
  private isAvailable(name: string): boolean {
    const impl = this.ctx.reflect._getImpl(name)
    return !!impl && (impl.check === undefined || !!impl.check.call(impl.value))
  }

  /** The entry owning a fiber, found by walking up to the fiber the entry was mounted as. */
  private entryOfFiber(fiber: Fiber): string | undefined {
    for (let current = fiber; ; current = current.parent.fiber) {
      const id = this.fiberIds.get(current)
      if (id !== undefined) return id
      if (current.parent.fiber === current) return
    }
  }

  private serviceOf(rt: Runtime): ServiceDeclaration {
    const builtin = this.builtins.get(rt.entry.name)
    const service = normalizeService((builtin?.manifest ?? this.packages.get(rt.entry.name)?.manifest)?.service)
    // A builtin's inject lists the bot internals it runs on, which mean nothing on the plugin page
    const plugin = builtin ? undefined : this.modules.get(rt.entry.name)?.plugin
    if (plugin) {
      service.required = [...new Set([...service.required, ...Object.keys(Inject.resolve(plugin.inject))])]
      const provide = plugin.provide === undefined ? [] : [plugin.provide].flat()
      service.implements = [...new Set([...service.implements, ...provide])]
    }
    return service
  }

  private incompatibility(pkg: PluginPackage): string | undefined {
    return sdkIncompatibility(pkg.sdkRange, this.sdkVersion)
  }

  private watch(): () => void {
    const pending = new Map<string, () => void>()
    const stop = watchPluginRoots(
      this.config.roots,
      (dir) => {
        pending.get(dir)?.()
        pending.set(dir, this.ctx.timeout(() => {
          pending.delete(dir)
          this.onPackageChanged(dir).catch(e => this.ctx.logger.warn(errorText(e)))
        }, 300))
      },
      error => this.ctx.logger.warn('plugin watcher:', error),
    )
    return () => {
      stop()
      for (const cancel of pending.values()) cancel()
    }
  }

  private async onPackageChanged(dir: string) {
    await this.scan()
    const root = await realpath(dir).catch(() => path.resolve(dir))
    const pkg = [...this.packages.values()].find(pkg => pkg.root === root)
    if (!pkg) return
    if (!this.entriesOf(pkg.name).some(rt => !rt.entry.disabled)) {
      this.modules.delete(pkg.name)
      return
    }
    this.ctx.logger.info(`${pkg.name} changed, reloading`)
    await this.lock(pkg.name, () => this.reloadPackage(pkg.name))
  }

  private createEntry(name: string, disabled: boolean, config?: unknown): Runtime {
    const entry: PluginEntry = { id: newEntryId(new Set(this.runtimes.keys())), name }
    if (disabled) entry.disabled = true
    if (config !== undefined) entry.config = config
    this.data.entries.push(entry)
    const rt: Runtime = { entry, reloadCount: 0 }
    this.runtimes.set(entry.id, rt)
    return rt
  }

  private entriesOf(name: string): Runtime[] {
    return [...this.runtimes.values()].filter(rt => rt.entry.name === name)
  }

  private save() {
    return this.store.save(this.data)
  }

  private changed(id?: string) {
    this.ctx.emit('plugins/changed', id)
  }

  /** Serializes work per key so watcher reloads cannot interleave with WebUI actions. */
  private lock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const current = previous.then(task, task)
    this.locks.set(key, current.catch(() => {}))
    return current
  }
}

namespace PluginService {
  export interface Config {
    /** data/plugins.json */
    file: string
    /** Directories whose child packages are plugins. */
    roots: string[]
    /** Watch the roots and reload changed packages. plugins.json `hmr: true` also turns it on. */
    hmr?: boolean
    /** Install the module.registerHooks resolver. Tests turn it off: the hook is process wide. */
    resolver?: boolean
    /** Plugins bundled with the bot, listed next to the installed ones. */
    builtins?: BuiltinPlugin[]
  }
}

function validateConfig(plugin: Plugin, config: unknown) {
  const schema = plugin.Config?.['~standard']
  if (!schema) return
  const result = schema.validate(config)
  if ('then' in result) throw new TypeError('async config validation is not supported')
  if (!result.issues) return
  throw new PluginConfigError(result.issues.map(issue => ({
    message: issue.message,
    path: (issue.path ?? []).map(segment => String(typeof segment === 'object' ? segment.key : segment)),
  })))
}

// npm names allow at most one slash and never a plus, which keeps the key a single path segment
function keyOfPackage(name: string): string {
  return name.replace('/', '+')
}

function packageOfKey(key: string): string {
  return key.replace('+', '/')
}

function webuiUrl(pkg: PluginPackage, version: number): string {
  return `/plugin-webui/${keyOfPackage(pkg.name)}/${version}/${encodeURIComponent(path.basename(pkg.webui!))}`
}

function hostSdkVersion(): string | undefined {
  try {
    return createRequire(import.meta.url)(`${SDK_PACKAGE}/package.json`).version
  } catch {
    return undefined
  }
}

function unwrapPlugin(exports: Record<string, any>): Plugin | undefined {
  if (typeof exports.apply === 'function') return exports as Plugin
  let value = exports.default
  // CommonJS interop from esbuild/tsc nests the real default one level deeper
  if (value?.__esModule && 'default' in value) value = value.default
  if (typeof value === 'function' || typeof value?.apply === 'function') return value
}

/** A Service subclass whose base is not our Service was built with cordis inlined. */
function bundlesOwnCordis(plugin: Plugin): boolean {
  if (typeof plugin !== 'function') return false
  for (let ctor = Object.getPrototypeOf(plugin); ctor && ctor !== Function.prototype; ctor = Object.getPrototypeOf(ctor)) {
    if (ctor === Service) return false
    if (ctor.name === 'Service') return true
  }
  return false
}

function errorText(error: unknown): string {
  if (error instanceof AggregateError) return error.errors.map(errorText).join('; ')
  return error instanceof Error ? error.message : String(error)
}

export default PluginService
