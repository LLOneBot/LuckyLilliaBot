import { createHash, randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber, FiberState, Inject, Plugin, Service, resolveConfig, symbols } from 'cordis'
import type { LLBotManifest } from '@luckylillia/plugin-sdk'
import type Schema from 'schemastery'
import { hydrate, SchemaNode } from '@/common/schema/model'
import { stripDefaults, withDefaults } from '@/common/schema/diff'
import {
  isInside, normalizeService, PluginPackage, readPluginPackage, scanPluginRoots, SDK_PACKAGE, sdkIncompatibility,
  ServiceDeclaration,
} from './manifest'
import { installPluginResolver, ResolverState, sharedSpecifierMap } from './resolve-hook'
import {
  newEntryId, PluginEntry, PluginOverlayStore, PluginOverride, PluginsFile, PluginStore,
} from './store'
import { watchPluginRoots } from './watcher'
import { PluginDataDirs } from './storage'

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
  /**
   * A builtin whose settings, on/off switch included, live in the bot's own files (BuiltinConfigBinding):
   * always mounted, and `disabled` mirrors that switch.
   */
  bound?: boolean
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
  /** Settings kept in the bot's own files rather than plugins.json; see BuiltinConfigBinding. */
  config?: BuiltinConfigBinding
}

/** What describe() shows for a stored secret; writing it back (or an empty string) keeps the stored one. */
export const SECRET_MASK = '********'

/**
 * Puts a builtin's settings behind the same schema, validation and form as a plugin's, while they stay where
 * they always were (an adapter's section of config_<uin>.json, email_config.json) so the desktop app, docker
 * templates and hand edits keep working. There is no per-account overlay: the value lives in one fixed layer.
 *
 * Such a builtin is always mounted. Its on/off switch is a flag inside the value (`satori.enable`, ...),
 * which the entry toggle drives -- the same flag the desktop app flips.
 */
export interface BuiltinConfigBinding<T = any> {
  schema: Schema<T>
  /** The layer the value lives in, for the form. */
  scope: ConfigScope
  /** Where the value is stored, for the form, e.g. `config_<uin>.json → satori`. */
  location: string
  /** The stored value; undefined while there is nothing to bind to yet (an adapter before login). */
  read(ctx: Context): T | undefined
  /** Stores the value and lets the running plugin pick it up. */
  write(ctx: Context, value: T): Promise<void>
  /** Rules the schema cannot express, e.g. a public listener needs a token. */
  check?(value: T): ConfigIssue[]
  /** Clean-up before validation, e.g. dropping blank list items the form leaves behind. */
  normalize?(value: T): T
  enabled: { get(value: T): boolean; set(value: T, on: boolean): T }
  /** Dotted paths of secrets: masked by describe(), kept on a write that sends the mask or nothing. */
  secrets?: string[]
  /** Calls back when the value changed elsewhere (desktop app, hand edit) so the plugin card can refresh. */
  watch?(ctx: Context, changed: () => void): () => void
}

export type ReloadResult = { status: 'reloaded' } | { status: 'restart-required'; reason: string }

/** Which config layer a write lands in: the instance-wide one, or this account's override. */
export type ConfigScope = 'global' | 'account'

export interface PluginDescription {
  /** schemastery `toJSON()` output, or null when the Config is absent or not schemastery. */
  schema: unknown
  defaults: unknown
  /** The global layer's diff against the defaults. Same as `global`, kept for the existing WebUI. */
  config: unknown
  global: unknown
  /** This account's override, or null when it does not override the config. */
  account: unknown
  /** The merged value the plugin actually runs with: defaults < global < account. */
  effective: unknown
  /** Where an unscoped write would land. */
  scope: ConfigScope
  /** Identifies both layers' current content; pass it back as `ifRev` to detect a lost update. */
  rev: string
  /** The logged-in account, empty before login (no account layer to write to yet). */
  uin: string
  /** Accounts that have a config directory, for deciding whether to offer the per-account scope. */
  accounts: string[]
  /** A builtin's settings live in one fixed layer: there is no scope to choose. */
  fixedScope?: boolean
  /** Where a builtin's settings are stored. */
  location?: string
  /** Dotted paths of fields that come back masked. */
  secrets?: string[]
}

export class PluginNotFoundError extends Error {}

/** The action does not apply to this entry, e.g. disabling a core builtin. */
export class PluginForbiddenError extends Error {}

/** Nothing to read or write yet, e.g. an adapter's settings before login. */
export class PluginUnavailableError extends Error {}

/** The config changed since the client read it, so the write would clobber someone else's edit. */
export class PluginRevConflictError extends Error {
  constructor(readonly rev: string) {
    super('the config changed since it was loaded')
  }
}

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
  // The logged-in account's override layer. Empty until account/prepare, so before login (and for a
  // deployment that never sets an override) every entry runs purely on the global layer.
  private overlayStore?: PluginOverlayStore
  private overlay = new Map<string, PluginOverride>()
  private accountUin = ''
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
  // The service's own context. Inside a method called through ctx.plugins, this.ctx is the CALLER's
  // context (cordis tracker), so mounting entries on it would parent them under whoever asked.
  private readonly home: Context
  private readonly dataDirs?: PluginDataDirs

  constructor(ctx: Context, public config: PluginService.Config) {
    super(ctx, 'plugins')
    this.home = ctx
    if (config.dataDir) {
      this.dataDirs = new PluginDataDirs(config.dataDir, () => (ctx.get('account') as { uin?: string } | undefined)?.uin)
    }
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
    const dirs = this.dataDirs
    if (dirs) {
      this.home.accessor('storage', {
        get() {
          // Reached from a service method another plugin called, `this` is the caller's context and the
          // service's own sits under symbols.shadow: the files belong to whoever defined the code
          const defSite = (this as unknown as Record<symbol, Context | undefined>)[symbols.shadow] ?? this
          const storage = dirs.storageOf(defSite.fiber)
          if (!storage) throw new Error('ctx.storage is only available to plugins loaded as entries')
          return storage
        },
      })
    }
    for (const rt of this.runtimes.values()) {
      const watch = this.bindingOf(rt)?.watch
      if (watch) disposers.push(watch(this.home, () => this.changed(rt.entry.id)))
    }
    disposers.push(this.ctx.on('account/prepare', (uin) => {
      this.applyAccount(uin).catch(e => this.ctx.logger.error(e))
    }))
    await this.scan()
    for (const rt of this.runtimes.values()) {
      if (this.isDisabled(rt)) continue
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
    const binding = this.bindingOf(rt)
    if (binding) return this.toggleBound(rt, binding, true)
    return this.lock(rt.entry.name, async () => {
      if (this.isDisabled(rt)) await this.setDisabled(rt, false)
      await this.start(rt)
      return this.status(rt)
    })
  }

  async disable(id: string): Promise<PluginStatus> {
    const rt = this.runtime(id)
    if (this.builtins.get(rt.entry.name)?.core) {
      throw new PluginForbiddenError(`${rt.entry.name} is part of the bot core and cannot be disabled`)
    }
    const binding = this.bindingOf(rt)
    if (binding) return this.toggleBound(rt, binding, false)
    return this.lock(rt.entry.name, async () => {
      await this.setDisabled(rt, true)
      await this.stop(rt)
      return this.status(rt)
    })
  }

  /**
   * Throws PluginConfigError, without touching the running instance, when the config is rejected.
   * `clear` lists secret paths to empty: a write that sends a secret masked or blank keeps the stored one.
   */
  async updateConfig(id: string, config: unknown, scope?: ConfigScope, ifRev?: string, clear: string[] = []): Promise<PluginStatus> {
    const rt = this.runtime(id)
    const binding = this.bindingOf(rt)
    if (binding) return this.updateBound(rt, binding, config, scope, ifRev, clear)
    this.assertConfigurable(rt)
    return this.lock(rt.entry.name, async () => {
      // Inside the lock, so two concurrent writers cannot both pass the check
      const rev = this.revOf(rt)
      if (ifRev !== undefined && ifRev !== rev) throw new PluginRevConflictError(rev)
      const mod = await this.load(this.package(rt))
      if (!mod.plugin) throw new Error(mod.error)
      const { node, defaults } = this.configModel(mod.plugin.Config)
      const target = this.writeScope(rt, scope)
      // The server owns the diff: fill the payload to its effective value (so it takes a full config or an
      // already-diffed one), validate that merged value (a lone layer would trip `required`), then store
      // only what differs from the layer underneath -- the defaults for the global layer, the global
      // effective value for an account override.
      const base = target === 'account' ? withDefaults(node, rt.entry.config ?? null, defaults) : defaults
      const effective = withDefaults(node, config, base)
      // fiber.update() only validates a loaded fiber; check up front so pending ones behave the same
      validateConfig(mod.plugin.Config, effective)
      const diff = stripDefaults(node, effective, base)
      if (target === 'account') {
        const override = this.overlay.get(rt.entry.id) ?? {}
        if (diff === undefined) delete override.config
        else override.config = diff
        if (Object.keys(override).length) this.overlay.set(rt.entry.id, override)
        else this.overlay.delete(rt.entry.id)
        await this.saveOverlay()
      } else {
        rt.entry.config = diff
        await this.save()
        this.warnOnRejectedOverride(rt, mod.plugin.Config, node, defaults)
      }
      const fiber = rt.fiber
      if (fiber) {
        rt.error = undefined
        // A failing apply() is reported through the fiber state, not thrown here
        await Promise.resolve(fiber.update(this.entryConfig(rt, mod.plugin), true)).catch(() => {})
        await fiber.await().catch(() => {})
      }
      return this.status(rt)
    })
  }

  /** Identifies both layers' current config for this entry, so a stale write can be rejected. */
  private revOf(rt: Runtime): string {
    const payload = JSON.stringify([rt.entry.config ?? null, this.overlay.get(rt.entry.id)?.config ?? null])
    return createHash('sha1').update(payload).digest('hex').slice(0, 12)
  }

  private async knownAccounts(): Promise<string[]> {
    const listed = await this.config.listAccounts?.().catch(() => [])
    if (listed?.length) return listed
    return this.accountUin ? [this.accountUin] : []
  }

  /** Explicit scope wins; otherwise write whichever layer the effective value already comes from. */
  private writeScope(rt: Runtime, scope?: ConfigScope): ConfigScope {
    // Before login there is no account layer to write to
    if (!this.overlayStore) return 'global'
    if (scope) return scope
    if (this.overlay.get(rt.entry.id)?.config !== undefined) return 'account'
    if (rt.entry.config !== undefined) return 'global'
    // Neither layer has configured it yet: the plugin's own preference decides
    return this.packages.get(rt.entry.name)?.manifest.configScope === 'account' ? 'account' : 'global'
  }

  /**
   * An account override that the new global layer turns invalid only gets a warning: blocking the save
   * would let one account's bad override freeze the config page of another (which has no UI to fix it).
   */
  private warnOnRejectedOverride(rt: Runtime, Config: unknown, node: SchemaNode | null, defaults: unknown) {
    const override = this.overlay.get(rt.entry.id)?.config
    if (override === undefined) return
    const base = withDefaults(node, rt.entry.config ?? null, defaults)
    try {
      validateConfig(Config, withDefaults(node, override, base))
    } catch (e) {
      this.ctx.logger.warn(`${this.accountUin} overrides ${rt.entry.name} with a config the new global layer rejects: ${errorText(e)}`)
    }
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
        const others = (implementers.get(name) ?? []).filter(other => !this.isDisabled(other))
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
    const binding = this.bindingOf(rt)
    if (binding) return this.describeBound(rt, binding)
    this.assertConfigurable(rt)
    return this.lock(rt.entry.name, async () => {
      const mod = await this.load(this.package(rt))
      const { schema, node, defaults } = this.configModel(mod.plugin?.Config)
      const global = rt.entry.config ?? null
      const account = this.overlay.get(rt.entry.id)?.config ?? null
      const base = withDefaults(node, global, defaults)
      return {
        schema,
        defaults,
        config: global,
        global,
        account,
        effective: account === null ? base : withDefaults(node, account, base),
        scope: this.writeScope(rt),
        rev: this.revOf(rt),
        uin: this.accountUin,
        accounts: await this.knownAccounts(),
      }
    })
  }

  /** Resolve a plugin's Config schema into the pieces the two-layer merge and the WebUI form need. */
  private configModel(Config: unknown): { schema: unknown; node: SchemaNode | null; defaults: unknown } {
    let defaults: unknown = {}
    try {
      defaults = resolveConfig({ Config } as Plugin.Runtime, undefined) ?? {}
    } catch {
      // required fields without defaults
    }
    const schema = typeof (Config as { toJSON?: unknown } | undefined)?.toJSON === 'function' ? JSON.parse(JSON.stringify(Config)) : null
    return { schema, node: schema ? hydrate(schema as { uid: number; refs: Record<string, unknown> }) : null, defaults }
  }

  /** Switch to this account's override layer and re-apply it to whatever is already running. */
  private async applyAccount(uin: string) {
    const file = uin && this.config.accountFile?.(uin)
    if (!file || this.accountUin === uin) return
    this.accountUin = uin
    this.overlayStore = new PluginOverlayStore(file)
    const { data, error } = await this.overlayStore.load()
    if (error) {
      // A broken overlay must not keep the account from starting; it runs on the global layer instead.
      this.ctx.logger.error(`invalid plugin overrides for ${uin}, ignoring them: ${error}`)
      return
    }
    this.overlay = new Map(Object.entries(data.entries))
    // Nothing overridden is the common case: leave every running fiber untouched.
    if (!this.overlay.size) return
    for (const rt of [...this.runtimes.values()]) {
      // A bound builtin's settings never come from plugins.json, so an override for it means nothing
      if (!this.overlay.has(rt.entry.id) || this.bindingOf(rt)) continue
      await this.lock(rt.entry.name, () => this.reapply(rt)).catch(e => this.ctx.logger.error(e))
    }
  }

  /** Bring one entry in line with the merged (global + account) view after the overlay changed. */
  private async reapply(rt: Runtime) {
    if (this.isDisabled(rt)) {
      if (rt.fiber) await this.stop(rt)
      return
    }
    if (!rt.fiber) return this.start(rt)
    const plugin = this.pluginOf(rt)
    if (!plugin) return
    await Promise.resolve(rt.fiber.update(this.entryConfig(rt, plugin), true)).catch(() => {})
    await rt.fiber.await().catch(() => {})
    this.changed(rt.entry.id)
  }

  /** disabled(e,u) = this account's override, else the global flag. Core builtins always run. */
  private isDisabled(rt: Runtime): boolean {
    const builtin = this.builtins.get(rt.entry.name)
    // A bound builtin keeps running; its switch lives inside its settings (see status())
    if (builtin?.core || builtin?.config) return false
    return this.overlay.get(rt.entry.id)?.disabled ?? !!rt.entry.disabled
  }

  /**
   * The config handed to cordis. Without an account override this is the stored global diff, byte for byte
   * what it was before the overlay existed (cordis fills the schema defaults itself); with one it is the
   * fully merged value defaults < global < account.
   */
  private entryConfig(rt: Runtime, plugin: Plugin): unknown {
    const override = this.overlay.get(rt.entry.id)?.config
    if (override === undefined) return rt.entry.config
    const { node, defaults } = this.configModel(plugin.Config)
    return withDefaults(node, override, withDefaults(node, rt.entry.config ?? null, defaults))
  }

  /** The already-loaded plugin behind an entry, if any. */
  private pluginOf(rt: Runtime): Plugin | undefined {
    return this.builtins.get(rt.entry.name)?.plugin ?? this.modules.get(rt.entry.name)?.plugin
  }

  /** Drops overrides of entries that no longer exist, and empty ones, so the file self-cleans. */
  private saveOverlay(): Promise<void> {
    if (!this.overlayStore) return Promise.resolve()
    const entries: Record<string, PluginOverride> = {}
    for (const [id, override] of this.overlay) {
      const rt = this.runtimes.get(id)
      if (!rt || this.bindingOf(rt)) continue
      const clean: PluginOverride = {}
      if (override.config !== undefined) clean.config = override.config
      if (override.disabled !== undefined) clean.disabled = override.disabled
      if (Object.keys(clean).length) entries[id] = clean
    }
    return this.overlayStore.save({ version: 1, entries })
  }

  /** Writes the flag to whichever layer the effective value comes from (§5 write routing). */
  private async setDisabled(rt: Runtime, disabled: boolean) {
    const override = this.overlay.get(rt.entry.id)
    if (override?.disabled !== undefined) {
      override.disabled = disabled
      await this.saveOverlay()
      return
    }
    if (disabled) rt.entry.disabled = true
    else delete rt.entry.disabled
    await this.save()
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

  private bindingOf(rt: Runtime): BuiltinConfigBinding | undefined {
    return this.builtins.get(rt.entry.name)?.config
  }

  private readBound(rt: Runtime, binding: BuiltinConfigBinding): unknown {
    const value = binding.read(this.home)
    if (value === undefined) {
      const title = this.builtins.get(rt.entry.name)?.title ?? rt.entry.name
      throw new PluginUnavailableError(`${title} 的设置存放在 ${binding.location}，登录 QQ 之后才能修改`)
    }
    return value
  }

  private async describeBound(rt: Runtime, binding: BuiltinConfigBinding): Promise<PluginDescription> {
    const value = this.readBound(rt, binding)
    const { schema, node, defaults } = this.configModel(binding.schema)
    const effective = maskSecrets(withDefaults(node, value, defaults), binding.secrets)
    return {
      schema,
      defaults,
      config: effective,
      global: effective,
      account: null,
      effective,
      scope: binding.scope,
      rev: boundRev(value),
      uin: this.accountUin,
      accounts: [],
      fixedScope: true,
      location: binding.location,
      secrets: binding.secrets ?? [],
    }
  }

  private updateBound(
    rt: Runtime, binding: BuiltinConfigBinding, config: unknown, scope: ConfigScope | undefined, ifRev: string | undefined, clear: string[],
  ): Promise<PluginStatus> {
    return this.lock(rt.entry.name, async () => {
      const current = this.readBound(rt, binding)
      const rev = boundRev(current)
      if (ifRev !== undefined && ifRev !== rev) throw new PluginRevConflictError(rev)
      if (scope && scope !== binding.scope) {
        throw new PluginForbiddenError(`${rt.entry.name} keeps its settings in ${binding.location} only`)
      }
      const { node, defaults } = this.configModel(binding.schema)
      // A full value is expected, as for a plugin's global layer; missing keys take the defaults
      const next = restoreSecrets(withDefaults(node, config, defaults), current, binding.secrets, clear)
      await binding.write(this.home, this.checkBound(binding, next))
      this.changed(rt.entry.id)
      return this.status(rt)
    })
  }

  /** The entry toggle flips the switch inside the value: the plugin itself stays mounted. */
  private toggleBound(rt: Runtime, binding: BuiltinConfigBinding, on: boolean): Promise<PluginStatus> {
    return this.lock(rt.entry.name, async () => {
      const current = this.readBound(rt, binding)
      if (binding.enabled.get(current) !== on) {
        const next = binding.enabled.set(current, on)
        // Switching on must not start what the form would refuse, e.g. a public listener without a token
        await binding.write(this.home, on ? this.checkBound(binding, next) : next)
      }
      if (!rt.fiber) await this.start(rt)
      this.changed(rt.entry.id)
      return this.status(rt)
    })
  }

  private checkBound(binding: BuiltinConfigBinding, value: unknown): unknown {
    const normalized = binding.normalize ? binding.normalize(value) : value
    validateConfig(binding.schema, normalized)
    const issues = binding.check?.(normalized) ?? []
    if (issues.length) throw new PluginConfigError(issues)
    return normalized
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
      // Ignored for these, so do not leave a stale flag in the file
      if ((builtin.core || builtin.config) && first.entry.disabled) {
        delete first.entry.disabled
        changed = true
      }
    }
    return changed
  }

  private async restartBuiltin(rt: Runtime, builtin: BuiltinPlugin): Promise<ReloadResult> {
    if (!this.isDisabled(rt)) {
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
    if (this.isDisabled(rt) || rt.fiber || !this.runtimes.has(rt.entry.id)) return
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
      // Mounted under a context carrying the entry's baseUrl, which the plugin's own context inherits
      const baseUrl = this.dataDirs?.baseUrl(rt.entry.name)
      const parent = baseUrl ? this.home.extend({ baseUrl }) : this.home
      const fiber = parent.plugin(plugin, this.entryConfig(rt, plugin)).ctx.fiber
      this.fiberIds.set(fiber, rt.entry.id)
      this.dataDirs?.register(fiber, rt.entry.name)
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
    const targets = this.entriesOf(name).filter(rt => !this.isDisabled(rt))
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
      disabled: this.isDisabled(rt),
      state: 'disposed',
      missingDeps: [],
      reloadCount: rt.reloadCount,
      hasConfig: builtin ? !!builtin.config : mod?.plugin ? !!mod.plugin.Config : undefined,
      service: this.serviceOf(rt),
      webui: pkg?.webui && webuiUrl(pkg, this.webuiVersions.get(pkg.name) ?? 0),
    }
    if (builtin) {
      Object.assign(status, { builtin: true, core: !!builtin.core, title: builtin.title })
      if (builtin.config) {
        status.bound = true
        // Unknown before login (nothing to read yet): show it as on rather than guess
        const value = builtin.config.read(this.home)
        status.disabled = value !== undefined && !builtin.config.enabled.get(value)
      }
    } else {
      if (!pkg) return { ...status, state: 'missing' }
      const incompatible = this.incompatibility(pkg)
      if (incompatible) return { ...status, state: 'incompatible', error: incompatible }
    }
    if (rt.error) status.error = rt.error
    if (!fiber) {
      if (status.error) status.state = 'failed'
      else if (!this.isDisabled(rt)) status.state = 'loading'
      return status
    }
    status.state = FIBER_STATES[fiber.state]
    if (status.state === 'pending') status.missingDeps = this.missingDeps(fiber)
    // Switched off, a bound builtin is mounted but idle: show it the way a disabled plugin looks
    else if (status.bound && status.disabled && status.state === 'active') status.state = 'disposed'
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
    if (!this.entriesOf(pkg.name).some(rt => !this.isDisabled(rt))) {
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
    /** data/config/global/plugins.json */
    file: string
    /** Where an account's override layer lives. Omitted = no per-account overrides at all. */
    accountFile?: (uin: string) => string
    /** Accounts that already have a config directory, for offering the per-account scope in the WebUI. */
    listAccounts?: () => Promise<string[]>
    /** Root of the plugins' data directories (ctx.storage, ctx.baseUrl). Omitted = neither is provided. */
    dataDir?: string
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

function validateConfig(Config: unknown, config: unknown) {
  const schema = (Config as Plugin['Config'] | undefined)?.['~standard']
  if (!schema) return
  const result = schema.validate(config)
  if ('then' in result) throw new TypeError('async config validation is not supported')
  if (!result.issues) return
  throw new PluginConfigError(result.issues.map(issue => ({
    message: issue.message,
    path: (issue.path ?? []).map(segment => String(typeof segment === 'object' ? segment.key : segment)),
  })))
}

// A bound value can hold a secret (the SMTP password): salted, so a rev cannot be brute-forced offline
const REV_SALT = randomBytes(16)

function boundRev(value: unknown): string {
  return createHash('sha1').update(REV_SALT).update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

function locate(root: unknown, dotted: string): { parent?: Record<string, unknown>; leaf: string } {
  const keys = dotted.split('.')
  let node = root
  for (const key of keys.slice(0, -1)) {
    if (!node || typeof node !== 'object') return { leaf: '' }
    node = (node as Record<string, unknown>)[key]
  }
  return { parent: node && typeof node === 'object' ? node as Record<string, unknown> : undefined, leaf: keys[keys.length - 1] }
}

function maskSecrets(value: unknown, secrets: string[] = []): unknown {
  if (!secrets.length) return value
  const copy = structuredClone(value)
  for (const dotted of secrets) {
    const { parent, leaf } = locate(copy, dotted)
    if (parent && typeof parent[leaf] === 'string' && parent[leaf]) parent[leaf] = SECRET_MASK
  }
  return copy
}

/** A secret sent back masked or blank keeps the stored value; only an explicit `clear` empties it. */
function restoreSecrets(next: unknown, current: unknown, secrets: string[] = [], clear: string[] = []): unknown {
  if (!secrets.length) return next
  const copy = structuredClone(next)
  for (const dotted of secrets) {
    const { parent, leaf } = locate(copy, dotted)
    if (!parent) continue
    if (clear.includes(dotted)) {
      parent[leaf] = ''
      continue
    }
    if (parent[leaf] !== SECRET_MASK && parent[leaf] !== '' && parent[leaf] !== undefined) continue
    const stored = locate(current, dotted)
    if (stored.parent && stored.parent[stored.leaf] !== undefined) parent[leaf] = stored.parent[stored.leaf]
  }
  return copy
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
