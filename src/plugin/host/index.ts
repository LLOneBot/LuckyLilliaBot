import { createHash, randomBytes } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber, FiberState, Inject, Plugin, Service, resolveConfig, symbols } from 'cordis'
import type { LLBotManifest } from '@luckylillia/plugin-sdk'
import type Schema from 'schemastery'
import { hydrate, SchemaNode } from '@/common/schema/model'
import { stripDefaults, withDefaults } from '@/common/schema/diff'
import {
  isImagePath, isInside, matchesPluginVersion, normalizeService, PluginAuthor, PluginPackage, readPluginPackage, scanPluginRoots, SDK_PACKAGE,
  sdkIncompatibility, ServiceDeclaration,
} from './manifest'
import { installPluginResolver, ResolverState, sharedSpecifierMap } from './resolve-hook'
import {
  newEntryId, normalizeUi, PluginEntry, PluginsFile, PluginStore, UiPrefs,
} from './store'
import { watchPluginRoots } from './watcher'
import { PluginDataDirs } from './storage'
import { maskSecrets, restoreSecrets, secretPaths } from './secrets'
import { acceptsScope, EntryScope, normalizeScope } from './scope'
import type BotsService from '../../universal/bots'
import type { ListenerPolicy } from '../../universal/bots'
import { BuiltinPackages, type BuiltinPackageIdentity, type BuiltinPackageInfo } from './builtin-packages'
export type { BuiltinPackageIdentity, BuiltinPackageInfo } from './builtin-packages'

declare module 'cordis' {
  interface Context {
    plugins: PluginService
  }
  interface Events {
    /** @mode emit. `id` is undefined when the entry list itself changed. */
    'plugins/changed'(id?: string): void
    /** @mode emit */
    'plugins/ui'(prefs: UiPrefs): void
  }
}

export type { UiPrefs }

/** A change to the UiPrefs, applied as a whole: several tabs may edit them at once. */
export interface UiPrefsPatch {
  hide?: string[]
  show?: string[]
  /** null drops the position */
  order?: Record<string, number | null>
}

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

export interface PluginStatus {
  id: string
  name: string
  version?: string
  /** Canonical npm identity, also present for bundled plugins whose stable entry uses builtin:. */
  packageName?: string
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
  /** Ships with the bot; a single entry. */
  builtin?: boolean
  /** A builtin the rest of the bot relies on, so it cannot be disabled. */
  core?: boolean
  /** Display name of a builtin. */
  title?: string
  /** Declared in the manifest, plus what the module injects and provides once it has been loaded. */
  service: ServiceDeclaration
  /** URL of the WebUI module; it changes whenever the package is reloaded, so the WebUI imports it afresh. */
  webui?: string
  /** What an enabled builtin says about its settings, e.g. that something still has to be filled in. */
  notice?: string
  /** Where it takes events from; absent: everywhere. */
  scope?: EntryScope
  /** Its place in the message order; absent: after the ordered ones, as it registered. */
  rank?: number
  /** It listens to bot/message, so it has a place in the message order. */
  messages?: boolean
  /** Its listeners or commands threw: the last error, and how often since it started. */
  listenerError?: ListenerError
  /** A third-party package the user agreed to run. */
  trusted?: boolean
  /** package.json `author` */
  author?: PluginAuthor
  /** URL of the image its package names in `llbot.icon`; absent for a lucide icon */
  iconUrl?: string
  /** The package declares `llbot.details` or `llbot.screenshots`, which its card offers behind 详情 */
  hasDetails?: boolean
}

/** What 详情 shows of a package; images go through `/plugin-assets` */
export interface PluginDetails {
  /** `llbot.details` */
  markdown?: string
  /** The URL of the details file's directory, which its relative image paths resolve against */
  base: string
  screenshots: { url: string; caption?: string }[]
}

export interface ListenerError {
  at: number
  message: string
  count: number
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
  /** Explicit plugin package requirements, separate from services and private npm libraries. */
  packages?: PackageDependencyInfo[]
  /** Services this entry implements that other enabled entries implement too. */
  conflicts: { service: string; with: string[] }[]
}

export interface PackageDependencyInfo {
  name: string
  range: string
  version?: string
  /** All entries belonging to this installed plugin package. */
  entries: string[]
  state: 'missing' | 'incompatible' | 'disabled' | 'pending' | 'active' | 'failed'
}

export interface BuiltinPlugin {
  /** Entry name; the `builtin:` prefix keeps it apart from package names. */
  name: string
  npm?: BuiltinPackageIdentity
  plugin: Plugin
  title: string
  manifest: LLBotManifest
  core?: boolean
  /** The plugin's Config is configurable like a package's; see BuiltinConfig. */
  config?: BuiltinConfig
  /**
   * Runs whatever the entry's switch says, for as long as the plugin service does: what the builtin's settings page
   * needs before the entry is switched on, e.g. the route sending a test email. It is mounted under the plugin
   * service, not as part of the entry, so it has no status, settings or data directory of its own.
   */
  standby?: Plugin
}

export { SECRET_MASK } from './secrets'

/**
 * What a builtin's settings need beyond its plugin's Config schema. They are stored in plugins.json like any
 * plugin's config, and its entry switch is the plugin switch.
 */
export interface BuiltinConfig<T = any> {
  /** Rules the schema cannot express, e.g. a public listener needs a token. `enabled`: whether it runs. */
  check?(value: T, enabled: boolean): ConfigIssue[]
  /** Clean-up before validation, e.g. dropping blank list items the form leaves behind. */
  normalize?(value: T): T
  /** Also check when the card switches the entry on: for a rule that is a security gate. */
  checkOnEnable?: boolean
  /**
   * Dotted paths of secrets: masked by describe(), kept on a write that sends the mask or nothing. A package's
   * are its `role('secret')` fields; a builtin names its own, as an adapter's token is shown on its page.
   */
  secrets?: string[]
  /** What a new entry starts with, e.g. default_config.json's section, which docker and nix edit. */
  initial?(): { enabled: boolean; config?: T }
  /**
   * Said on the card of an enabled entry with these settings: for a plugin that starts fine without them but
   * waits for them, instead of failing at start what saving them checks.
   */
  notice?(value: T): string | undefined
}

export type ReloadResult = { status: 'reloaded' } | { status: 'restart-required'; reason: string }

export interface PluginDescription {
  /** schemastery `toJSON()` output, or null when the Config is absent or not schemastery. */
  schema: unknown
  defaults: unknown
  /** What is stored: the diff against the defaults. */
  config: unknown
  /** The value the plugin actually runs with: the defaults filled in. */
  effective: unknown
  /** Identifies the stored config; pass it back as `ifRev` to detect a lost update. */
  rev: string
  /** Dotted paths of fields that come back masked. */
  secrets?: string[]
}

export class PluginNotFoundError extends Error {}

/** The action does not apply to this entry, e.g. disabling a core builtin. */
export class PluginForbiddenError extends Error {}

/**
 * A third-party package runs its code with the bot's rights: the user has to agree before its first start. Starting
 * again with `trust: true` records that.
 */
export class PluginTrustRequiredError extends Error {
  constructor(readonly pkg: string) {
    super(`${pkg} has not been trusted to run yet`)
  }
}

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
  listenerError?: ListenerError
  /** When a listener error last went out as a change: a plugin failing on every message must not flood the WebUI */
  listenerNoticed?: number
  /** Waiting for an installed, compatible package; rescans retry only entries stopped by this gate. */
  packageBlocked?: boolean
}

const LISTENER_NOTICE_INTERVAL = 1_000

const requireCache = createRequire(import.meta.url).cache

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
  private readonly builtinPackages: BuiltinPackages
  private readonly builtinStandby = new Map<string, Fiber>()
  private readonly builtinBranches = new WeakMap<Fiber, { name: string; standby: boolean }>()
  // The service's own context. Inside a method called through ctx.plugins, this.ctx is the CALLER's
  // context (cordis tracker), so mounting entries on it would parent them under whoever asked.
  private readonly home: Context
  private readonly dataDirs?: PluginDataDirs

  constructor(ctx: Context, public config: PluginService.Config) {
    super(ctx, 'plugins')
    this.home = ctx
    if (config.dataDir) {
      this.dataDirs = new PluginDataDirs(config.dataDir)
    }
    this.store = new PluginStore(config.file)
    this.builtins = new Map((config.builtins ?? []).map(builtin => [builtin.name, builtin]))
    this.builtinPackages = new BuiltinPackages(this.builtins.values(), config.roots[0])
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
    // What already ran before trust was asked for keeps running without asking
    const trustSet = !data.trusted
    if (trustSet) data.trusted = [...new Set(data.entries.filter(entry => !entry.disabled && !this.builtins.has(entry.name)).map(entry => entry.name))]
    await this.builtinPackages.restore(this.sdkVersion).catch(error => this.ctx.logger.warn(errorText(error)))
    await this.builtinPackages.load(this.builtins, value => {
      const plugin = value as Plugin
      return !!plugin && (typeof plugin === 'function' || typeof plugin.apply === 'function') && !bundlesOwnCordis(plugin)
    })
    for (const pkg of this.builtinPackages.list()) {
      if (pkg.error) this.ctx.logger.warn(`${pkg.name}: using bundled version; ${pkg.error}`)
    }
    const reconciled = this.reconcileBuiltins()
    if ((reconciled || trustSet) && !error) await this.save()

    this.ctx.on('internal/status', fiber => this.onFiberStatus(fiber))
    const policy: ListenerPolicy = {
      owner: ctx => this.entryOfFiber(ctx.fiber),
      accepts: (id, place) => acceptsScope(this.runtimes.get(id)?.entry.scope, place),
      rank: (id) => {
        const index = this.data.messageOrder?.indexOf(id) ?? -1
        return index < 0 ? undefined : index
      },
      failed: (id, error) => this.noteListenerError(id, error),
    }
    this.home.inject(['bots'], (ctx) => {
      ctx.effect(() => (ctx.bots as unknown as BotsService).usePolicy(policy))
    })
    for (const builtin of this.builtins.values()) {
      this.mountBuiltinStandby(builtin)
    }
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

  /** The entry behind a logger's fiber, including nested services and logs during disposal. */
  logSource(fiber: Fiber): { id: string; name: string; title: string } | undefined {
    const id = this.entryOfFiber(fiber)
    if (id === undefined) return
    const entry = this.runtimes.get(id)?.entry
    if (!entry) return
    const builtin = this.builtins.get(entry.name)
    const declared = this.packages.get(entry.name)?.manifest.title
    // Keep the same title precedence as the WebUI's pluginTitle().
    const localized = typeof declared === 'string' ? declared.trim() || undefined
      : declared?.zh ?? declared?.['zh-CN'] ?? declared?.en
    const title = builtin?.title ?? localized ?? entry.name.replace(/^(@[^/]+\/)?luckylillia-plugin-/, '')
    return { id, name: entry.name, title }
  }

  /** The plugin packages the last scan found */
  packageList(): PluginPackage[] {
    return [...this.packages.values()]
  }

  /** Official npm identities, including the versions that ship with Bot before any update is installed. */
  builtinPackageList(): BuiltinPackageInfo[] {
    return this.builtinPackages.list()
  }

  checkBuiltinPackage(name: string, manifest: Record<string, any>): string | undefined {
    return this.builtinPackages.check(name, manifest, this.sdkVersion)
  }

  /** Market calls this only for catalog-pinned downloads, never for uploaded or merely discovered packages. */
  async approveBuiltinPackage(name: string, version: string): Promise<void> {
    await this.builtinPackages.approve(name, version, this.sdkVersion)
    this.changed()
  }

  /** The @luckylillia/plugin-sdk version plugins' peerDependencies are checked against */
  hostSdk(): string | undefined {
    return this.sdkVersion
  }

  scan() {
    return this.lock(SCAN_LOCK, () => this.rescan())
  }

  async add(name: string, config?: unknown, options: { trust?: boolean } = {}): Promise<PluginStatus> {
    if (this.builtins.has(name)) throw new PluginForbiddenError(`${name} is builtin and runs as a single instance`)
    if (!this.packages.has(name)) throw new PluginNotFoundError(`no plugin package named ${name}`)
    this.assertTrusted(name, options.trust)
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
    if (this.data.messageOrder?.includes(id)) this.data.messageOrder = this.data.messageOrder.filter(item => item !== id)
    await this.save()
    this.changed()
  }

  /**
   * Drops a package's trust and the positions and visibility of its WebUI contributions. For
   * a package that is gone: installing it again asks again.
   */
  async forget(name: string): Promise<void> {
    const ui = this.data.ui
    const prefix = `${name}|`
    const granted = this.data.trusted?.includes(name)
      || ui?.hidden.some(key => key.startsWith(prefix)) || Object.keys(ui?.order ?? {}).some(key => key.startsWith(prefix))
    if (!granted) return
    if (this.data.trusted) this.data.trusted = this.data.trusted.filter(item => item !== name)
    if (ui) {
      ui.hidden = ui.hidden.filter(key => !key.startsWith(prefix))
      for (const key of Object.keys(ui.order)) if (key.startsWith(prefix)) delete ui.order[key]
    }
    await this.save()
    this.ctx.emit('plugins/ui', this.uiPrefs())
    this.changed()
  }

  /**
   * `rules: false` skips a builtin's own rules (see updateConfig). A third-party package the user has not trusted yet
   * throws PluginTrustRequiredError, unless `trust` says they just did.
   */
  async enable(id: string, options: { rules?: boolean; trust?: boolean } = {}): Promise<PluginStatus> {
    const rt = this.runtime(id)
    this.assertTrusted(rt.entry.name, options.trust)
    return this.lock(rt.entry.name, async () => {
      if (this.isDisabled(rt)) {
        // A config saved while switched off must not get past a security rule this way
        const builtin = this.builtins.get(rt.entry.name)
        if (builtin?.config?.checkOnEnable && options.rules !== false) {
          const { node, defaults } = this.configModel(builtin.plugin.Config)
          this.checked(rt, builtin.plugin.Config, withDefaults(node, rt.entry.config ?? null, defaults), true)
        }
        await this.setDisabled(rt, false)
      }
      await this.start(rt)
      return this.status(rt)
    })
  }

  /** Where the entry takes events from; nothing (or a scope letting everything through) clears it. Applies at once. */
  async setScope(id: string, scope: unknown): Promise<PluginStatus> {
    const rt = this.runtime(id)
    const normalized = normalizeScope(scope)
    if (normalized) rt.entry.scope = normalized
    else delete rt.entry.scope
    await this.save()
    this.changed(id)
    return this.status(rt)
  }

  /** The entries whose message listeners run first, in this order; unknown ids are dropped. Applies at once. */
  async setMessageOrder(order: unknown): Promise<string[]> {
    const ids = Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string' && this.runtimes.has(id)) : []
    this.data.messageOrder = [...new Set(ids)]
    await this.save()
    this.changed()
    return [...this.data.messageOrder]
  }

  clearListenerError(id: string): PluginStatus {
    const rt = this.runtime(id)
    rt.listenerError = undefined
    this.changed(id)
    return this.status(rt)
  }

  private noteListenerError(id: string, error: unknown) {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.listenerError = { at: Date.now(), message: errorText(error), count: (rt.listenerError?.count ?? 0) + 1 }
    if (rt.listenerNoticed !== undefined && Date.now() - rt.listenerNoticed < LISTENER_NOTICE_INTERVAL) return
    rt.listenerNoticed = Date.now()
    this.changed(id)
  }

  private isTrusted(name: string): boolean {
    return !this.config.trust || this.builtins.has(name) || !!this.data.trusted?.includes(name)
  }

  /** Records the trust when `trust` says the user just gave it. */
  private assertTrusted(name: string, trust?: boolean) {
    if (this.isTrusted(name)) return
    if (!trust) throw new PluginTrustRequiredError(name)
    this.data.trusted = [...this.data.trusted ?? [], name]
  }

  async disable(id: string): Promise<PluginStatus> {
    const rt = this.runtime(id)
    if (this.builtins.get(rt.entry.name)?.core) {
      throw new PluginForbiddenError(`${rt.entry.name} is part of the bot core and cannot be disabled`)
    }
    return this.lock(rt.entry.name, async () => {
      await this.setDisabled(rt, true)
      await this.stop(rt)
      return this.status(rt)
    })
  }

  /**
   * Throws PluginConfigError, without touching the running instance, when the config is rejected.
   * `clear` lists secret paths to empty: a write that sends a secret masked or blank keeps the stored one.
   * `rules: false` skips a builtin's own rules but not its schema, for OneBot set_config, which never had them.
   */
  async updateConfig(
    id: string, config: unknown, ifRev?: string, clear: string[] = [], options: { rules?: boolean } = {},
  ): Promise<PluginStatus> {
    const rt = this.runtime(id)
    this.assertConfigurable(rt)
    return this.lock(rt.entry.name, async () => {
      // Inside the lock, so two concurrent writers cannot both pass the check
      const rev = this.revOf(rt)
      if (ifRev !== undefined && ifRev !== rev) throw new PluginRevConflictError(rev)
      const Config = await this.configSchemaOf(rt, true)
      const { node, defaults } = this.configModel(Config)
      // The server owns the diff: fill the payload to its effective value (so it takes a full config or an
      // already-diffed one), validate that (a diff alone would trip `required`), then store only what differs
      // from the defaults.
      const stored = withDefaults(node, rt.entry.config ?? null, defaults)
      const restored = restoreSecrets(withDefaults(node, config, defaults), stored, this.secretsOf(rt, node), clear, REV_SALT)
      if (restored.issues.length) throw new PluginConfigError(restored.issues)
      const effective = restored.value
      // fiber.update() only validates a loaded fiber; check up front so pending ones behave the same
      const value = this.checked(rt, Config, effective, !this.isDisabled(rt), options.rules !== false)
      rt.entry.config = stripDefaults(node, value, defaults)
      await this.save()
      const fiber = rt.fiber
      if (fiber) {
        rt.error = undefined
        // A failing apply() is reported through the fiber state, not thrown here
        await Promise.resolve(fiber.update(rt.entry.config, true)).catch(() => {})
        await fiber.await().catch(() => {})
      }
      return this.status(rt)
    })
  }

  private revOf(rt: Runtime): string {
    return createHash('sha1').update(REV_SALT).update(JSON.stringify(rt.entry.config ?? null)).digest('hex').slice(0, 12)
  }

  /** Validates a full value, plus a builtin's own rules; returns it as it should be stored. */
  private checked(rt: Runtime, Config: unknown, value: unknown, enabled: boolean, rules = true): unknown {
    const extra = this.builtins.get(rt.entry.name)?.config
    const normalized = extra?.normalize ? extra.normalize(value) : value
    validateConfig(Config, normalized)
    const issues = (rules && extra?.check?.(normalized, enabled)) || []
    if (issues.length) throw new PluginConfigError(issues)
    return normalized
  }

  /** A builtin's settings as its plugin runs with them, for the routes that still speak the old config shape. */
  builtinSettings(name: string): { id: string; enabled: boolean; config: unknown } | undefined {
    const builtin = this.builtins.get(name)
    const rt = this.entriesOf(name)[0]
    if (!builtin?.config || !rt) return
    const { node, defaults } = this.configModel(builtin.plugin.Config)
    return { id: rt.entry.id, enabled: !this.isDisabled(rt), config: withDefaults(node, rt.entry.config ?? null, defaults) }
  }

  async reload(id: string): Promise<ReloadResult> {
    const rt = this.runtime(id)
    const builtin = this.builtins.get(rt.entry.name)
    // The WebUI's own entry would close the server the request came in through, and wait on that very request
    if (builtin?.core) throw new PluginForbiddenError(`${rt.entry.name} is part of the bot core and cannot be restarted`)
    // Bundled with the bot, so there is no code to re-import: a restart picks up the current settings
    if (builtin) return this.lock(rt.entry.name, () => this.restartBuiltin(rt, builtin))
    if (!this.resolverInstalled) {
      return { status: 'restart-required', reason: 'module.registerHooks is unavailable (Node < 22.15), changed submodules would not be re-imported' }
    }
    try {
      return await this.lock(rt.entry.name, () => this.reloadPackage(rt.entry.name))
    } finally {
      await this.reconcilePackageDependencies()
    }
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
    const packages = this.packageDependencies(rt)
    return {
      ...(packages.length ? { packages } : {}),
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
    const name = packageOfKey(key)
    const builtin = this.builtinPackages.list().find(item => item.name === name)
    const entry = (builtin ? this.builtinPackages.package(builtin.entryName) : this.packages.get(name))?.webui
    if (!entry) return
    const dir = path.dirname(entry)
    const target = path.resolve(dir, file)
    return isInside(dir, target) ? target : undefined
  }

  /**
   * An image of an installed package, for `/plugin-assets/<key>/<version>/<file>`: its icon, its screenshots and what
   * its details show. Only image files inside the package are served.
   */
  asset(key: string, file: string): string | undefined {
    const name = packageOfKey(key)
    const builtin = this.builtinPackages.list().find(item => item.name === name)
    const pkg = builtin ? this.builtinPackages.package(builtin.entryName) : this.packages.get(name)
    if (!pkg || !isImagePath(file)) return
    const target = path.resolve(pkg.root, file)
    return isInside(pkg.root, target) ? target : undefined
  }

  /** Read when asked, so an edited details file shows without a rescan. A builtin has none. */
  async details(id: string): Promise<PluginDetails> {
    const name = this.runtime(id).entry.name
    const pkg = this.builtinPackages.package(name) ?? this.packages.get(name)
    if (!pkg) return { base: '', screenshots: [] }
    const dir = pkg.detailsFile ? path.posix.dirname(pkg.detailsFile) : '.'
    return {
      ...pkg.detailsFile ? { markdown: await readFile(path.resolve(pkg.root, pkg.detailsFile), 'utf8') } : {},
      base: assetUrl(pkg, dir === '.' ? '' : `${dir}/`),
      screenshots: pkg.screenshots.map(({ file, caption }) => ({ url: assetUrl(pkg, file), ...caption ? { caption } : {} })),
    }
  }

  uiPrefs(): UiPrefs {
    return structuredClone(this.data.ui ?? normalizeUi(undefined))
  }

  /** Updates visibility and positions by contribution key, including keys for packages no longer installed. */
  async updateUiPrefs(patch: UiPrefsPatch): Promise<UiPrefs> {
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item) : [])
    const prefs = this.uiPrefs()
    const show = new Set(strings(patch.show))
    prefs.hidden = [...new Set([...prefs.hidden, ...strings(patch.hide)])].filter(key => !show.has(key))
    if (patch.order && typeof patch.order === 'object') {
      for (const [key, position] of Object.entries(patch.order)) {
        if (position === null) delete prefs.order[key]
        else if (typeof position === 'number' && Number.isFinite(position)) prefs.order[key] = position
      }
    }
    this.data.ui = prefs
    await this.save()
    this.ctx.emit('plugins/ui', this.uiPrefs())
    return this.uiPrefs()
  }

  /** Imports the module if it has not been loaded yet, so it also works for disabled entries. */
  async describe(id: string): Promise<PluginDescription> {
    const rt = this.runtime(id)
    this.assertConfigurable(rt)
    return this.lock(rt.entry.name, async () => {
      const { schema, node, defaults } = this.configModel(await this.configSchemaOf(rt, false))
      const secrets = this.secretsOf(rt, node)
      const config = rt.entry.config ?? null
      return {
        schema,
        defaults,
        config: maskSecrets(config, secrets, REV_SALT),
        effective: maskSecrets(withDefaults(node, config, defaults), secrets, REV_SALT),
        rev: this.revOf(rt),
        ...secrets.length ? { secrets } : {},
      }
    })
  }

  /** A builtin names its secrets; a package's are its `role('secret')` fields */
  private secretsOf(rt: Runtime, node: SchemaNode | null): string[] {
    const builtin = this.builtins.get(rt.entry.name)
    return builtin ? builtin.config?.secrets ?? [] : secretPaths(node)
  }

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

  /** Core builtins always run. */
  private isDisabled(rt: Runtime): boolean {
    if (this.builtins.get(rt.entry.name)?.core) return false
    return !!rt.entry.disabled
  }

  private async setDisabled(rt: Runtime, disabled: boolean) {
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
    const builtin = this.builtins.get(rt.entry.name)
    if (builtin && !builtin.config) {
      throw new PluginForbiddenError(`${rt.entry.name} is builtin and has no settings`)
    }
  }

  /** `strict`: a package whose module did not load is an error, not just a missing schema. */
  private async configSchemaOf(rt: Runtime, strict: boolean): Promise<unknown> {
    const builtin = this.builtins.get(rt.entry.name)
    if (builtin) return builtin.plugin.Config
    const mod = await this.load(this.package(rt))
    if (strict && !mod.plugin) throw new Error(mod.error)
    return mod.plugin?.Config
  }

  /** One entry per builtin, created from its initial settings; core builtins always run. Returns whether entries changed. */
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
        const initial = builtin.config?.initial?.()
        let config: unknown
        if (initial?.config !== undefined) {
          const { node, defaults } = this.configModel(builtin.plugin.Config)
          config = stripDefaults(node, withDefaults(node, initial.config, defaults), defaults)
        }
        this.createEntry(builtin.name, initial ? !initial.enabled : false, config)
        changed = true
        continue
      }
      // Ignored for these, so do not leave a stale flag in the file
      if (builtin.core && first.entry.disabled) {
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
      // Reserved identities are never ordinary trusted packages or extra plugin entries. Approved snapshots
      // were selected at boot; replacing the installation on disk cannot change live core services.
      if (this.builtinPackages.has(pkg.name) || (pkg.manifest as any).builtin) continue
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
    // An edit of what the WebUI shows (title, icon, details) needs no reload, but the list goes out again
    const shown = (pkg: PluginPackage) => JSON.stringify([pkg.manifest, pkg.description, pkg.author, pkg.iconFile, pkg.detailsFile, pkg.screenshots])
    const edited = [...next.values()].some(pkg => {
      const old = this.packages.get(pkg.name)
      return old && shown(old) !== shown(pkg)
    })
    this.packages = next
    this.resolver.roots = [...next.values(), ...this.builtinPackages.list().flatMap(item => {
      const pkg = this.builtinPackages.package(item.entryName)
      return pkg ? [pkg] : []
    })].map(pkg => pathToFileURL(pkg.root + path.sep).href)
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
    await this.reconcilePackageDependencies()
    if (added.length || removed.length || changed.length || edited) this.changed()
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
      const mounted = this.mount(rt, builtin.plugin)
      await mounted?.await().catch(() => {})
      const current = this.runtimes.get(rt.entry.id)
      if (!current || current.fiber !== mounted) return
      if (mounted?.state === FiberState.FAILED || (!mounted && rt.error)) {
        await this.restoreBuiltin(builtin, rt.error ?? 'The updated built-in plugin failed to start')
      }
      return
    }
    const pkg = this.packages.get(rt.entry.name)
    if (!pkg || this.incompatibility(pkg) || this.packageBlock(rt)) {
      rt.packageBlocked = true
      return this.changed(rt.entry.id)
    }
    const mod = await this.load(pkg)
    if (!mod.plugin) {
      rt.error = mod.error
      return this.changed(rt.entry.id)
    }
    await this.mount(rt, mod.plugin)?.await().catch(() => {})
  }

  private mount(rt: Runtime, plugin: Plugin): Fiber | undefined {
    // The package list may have changed while its module was being imported. Reloads use this gate too.
    if (this.packageBlock(rt)) {
      rt.packageBlocked = true
      this.changed(rt.entry.id)
      return
    }
    rt.packageBlocked = false
    rt.error = undefined
    try {
      // ctx.plugin() hands back a thenable wrapper; internal/status reports the fiber itself
      // Mounted under a context carrying the entry's baseUrl, which the plugin's own context inherits
      const baseUrl = this.dataDirs?.baseUrl(rt.entry.name)
      const parent = baseUrl ? this.home.extend({ baseUrl }) : this.home
      const fiber = parent.plugin(plugin, rt.entry.config).ctx.fiber
      this.fiberIds.set(fiber, rt.entry.id)
      this.dataDirs?.register(fiber, rt.entry.name)
      rt.fiber = fiber
      if (this.builtins.has(rt.entry.name)) {
        this.builtinBranches.set(fiber, { name: rt.entry.name, standby: false })
        this.observeBuiltinFailure(fiber)
      }
    } catch (e) {
      rt.error = errorText(e)
    }
    this.changed(rt.entry.id)
    return rt.fiber
  }

  private mountBuiltinStandby(builtin: BuiltinPlugin) {
    if (!builtin.standby) return
    try {
      const fiber = this.home.plugin(builtin.standby).ctx.fiber
      this.builtinStandby.set(builtin.name, fiber)
      this.builtinBranches.set(fiber, { name: builtin.name, standby: true })
      this.observeBuiltinFailure(fiber)
    } catch (error) {
      if (!this.builtinPackages.package(builtin.name)) throw error
      this.lock(builtin.name, () => this.restoreBuiltin(builtin, errorText(error))).catch(error => this.ctx.logger.warn(errorText(error)))
    }
  }

  /** Includes deferred injects and nested services: the entry fiber itself may remain ACTIVE. */
  private observeBuiltinFailure(fiber: Fiber) {
    if (fiber.state !== FiberState.FAILED) return
    for (let current = fiber; ; current = current.parent.fiber) {
      const branch = this.builtinBranches.get(current)
      if (branch) {
        const { name, standby } = branch
        const isCurrent = () => standby ? this.builtinStandby.get(name) === current
          : this.entriesOf(name).some(rt => rt.fiber === current)
        const builtin = this.builtins.get(name)
        if (!builtin || !isCurrent() || !this.builtinPackages.package(name)) return
        fiber.await().catch(error => this.lock(name, async () => {
          if (isCurrent()) await this.restoreBuiltin(builtin, errorText(error))
        })).catch(error => this.ctx.logger.warn(errorText(error)))
        return
      }
      if (current.parent.fiber === current) return
    }
  }

  /** Caller holds the entry lock. Remove both updated branches before restoring either bundled branch. */
  private async restoreBuiltin(expected: BuiltinPlugin, reason: string) {
    const name = expected.name
    if (this.builtins.get(name) !== expected || !this.builtinPackages.package(name)) return
    const shuttingDown = () => [FiberState.UNLOADING, FiberState.DISPOSED].includes(this.home.fiber.state)
    if (shuttingDown()) return
    const rt = this.entriesOf(name)[0]
    const standby = this.builtinStandby.get(name)
    this.builtinStandby.delete(name)
    if (rt) await this.stop(rt)
    await standby?.dispose()
    const fallback = this.builtinPackages.fallback(name, reason)
    if (!fallback) return
    this.builtins.set(name, fallback)
    if (!shuttingDown()) {
      this.mountBuiltinStandby(fallback)
      if (rt && !this.isDisabled(rt)) await this.mount(rt, fallback.plugin)?.await().catch(() => {})
    }
    this.changed()
    // Consumers of the rejected update must not keep running against a now-older package version.
    this.reconcilePackageDependencies().catch(error => this.ctx.logger.warn(errorText(error)))
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
    const targets = this.entriesOf(name).filter(rt => !this.isDisabled(rt))
    if (this.incompatibility(pkg) || targets.some(rt => this.packageBlock(rt))) {
      for (const rt of targets) {
        await this.stop(rt)
        rt.packageBlocked = true
      }
      this.changed()
      return { status: 'reloaded' }
    }
    // ?v= re-imports the package's ES modules; CommonJS ones (dependencies, mostly) sit in require.cache by path
    for (const file of Object.keys(requireCache)) {
      if (isInside(pkg.root, file)) delete requireCache[file]
    }
    const mod = await this.load(pkg, true)
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
    this.observeBuiltinFailure(fiber)
    const id = this.fiberIds.get(fiber)
    const rt = id === undefined ? undefined : this.runtimes.get(id)
    if (!rt || rt.fiber !== fiber) return
    if (fiber.state === FiberState.FAILED) {
      // await() rethrows the error the fiber failed with
      fiber.await().catch((e) => {
        if (rt.fiber !== fiber) return
        rt.error = errorText(e)
        this.changed(rt.entry.id)
      })
      return
    }
    if (fiber.state === FiberState.ACTIVE) {
      rt.error = undefined
      rt.listenerError = undefined
    }
    this.changed(rt.entry.id)
  }

  private status(rt: Runtime): PluginStatus {
    const { entry, fiber } = rt
    const builtin = this.builtins.get(entry.name)
    const pkg = this.builtinPackages.package(entry.name) ?? this.packages.get(entry.name)
    const mod = this.modules.get(entry.name)
    const status: PluginStatus = {
      id: entry.id,
      name: entry.name,
      version: pkg?.version ?? builtin?.npm?.version,
      packageName: builtin?.npm?.name ?? pkg?.name,
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
    if (pkg?.author) status.author = pkg.author
    if (pkg?.iconFile) status.iconUrl = assetUrl(pkg, pkg.iconFile)
    if (pkg?.detailsFile || pkg?.screenshots.length) status.hasDetails = true
    if (entry.scope) status.scope = entry.scope
    if (!builtin) status.trusted = this.isTrusted(entry.name)
    if (builtin) {
      Object.assign(status, { builtin: true, core: !!builtin.core, title: builtin.title })
    } else {
      if (!pkg) return { ...status, state: 'missing' }
      const incompatible = this.incompatibility(pkg)
      if (incompatible) return { ...status, state: 'incompatible', error: incompatible }
    }
    if (!status.disabled) {
      const blocked = this.packageBlock(rt)
      if (blocked) return { ...status, ...blocked }
    }
    if (rt.error) status.error = rt.error
    if (builtin?.config?.notice && !status.disabled) status.notice = this.noticeOf(builtin, rt)
    const rank = this.data.messageOrder?.indexOf(entry.id) ?? -1
    if (rank >= 0) status.rank = rank
    if (this.messageOwners().has(entry.id)) status.messages = true
    if (rt.listenerError) status.listenerError = rt.listenerError
    if (!fiber) {
      if (status.error) status.state = 'failed'
      else if (!this.isDisabled(rt)) status.state = 'loading'
      return status
    }
    status.state = FIBER_STATES[fiber.state]
    if (status.state === 'pending') status.missingDeps = this.missingDeps(fiber)
    return status
  }

  private noticeOf(builtin: BuiltinPlugin, rt: Runtime): string | undefined {
    try {
      return builtin.config!.notice!(resolveConfig({ Config: builtin.plugin.Config } as Plugin.Runtime, rt.entry.config ?? {}))
    } catch {
      // A config the schema rejects: saving it says why
    }
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

  /** Entries with a bot/message listener of their own. */
  private messageOwners(): Set<string> {
    const owners = new Set<string>()
    for (const hook of (this.ctx.events._hooks as Record<string, { ctx: Context }[] | undefined>)['bot/message'] ?? []) {
      const id = this.entryOfFiber(hook.ctx.fiber)
      if (id !== undefined) owners.add(id)
    }
    return owners
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

  private incompatibility(pkg: Pick<PluginPackage, 'sdkRange'>): string | undefined {
    return sdkIncompatibility(pkg.sdkRange, this.sdkVersion)
  }

  private packageRequirements(rt: Runtime): Record<string, string> {
    return (this.builtins.get(rt.entry.name)?.manifest ?? this.packages.get(rt.entry.name)?.manifest)?.dependencies ?? {}
  }

  private dependencyPackage(name: string): Pick<PluginPackage, 'name' | 'version' | 'sdkRange'> | undefined {
    const pkg = this.packages.get(name)
    if (pkg) return pkg
    const builtin = this.builtinPackages.list().find(item => item.name === name)
    // Staged versions are deliberately not dependency providers until the instance restarts.
    if (builtin) return { name: builtin.entryName, version: builtin.activeVersion }
  }

  private packageBlock(rt: Runtime): { state: 'pending' | 'incompatible'; error: string } | undefined {
    for (const [name, range] of Object.entries(this.packageRequirements(rt))) {
      const pkg = this.dependencyPackage(name)
      if (!pkg) return { state: 'pending', error: `requires plugin package ${name} ${range}, but it is not installed` }
      if (!matchesPluginVersion(pkg.version, range)) {
        return { state: 'incompatible', error: `requires plugin package ${name} ${range}, installed version is ${pkg.version}` }
      }
    }
  }

  private packageDependencies(rt: Runtime): PackageDependencyInfo[] {
    return Object.entries(this.packageRequirements(rt)).map(([name, range]) => {
      const pkg = this.dependencyPackage(name)
      const entries = this.entriesOf(pkg?.name ?? name)
      const enabled = entries.filter(entry => !this.isDisabled(entry))
      const base = { name, range, entries: entries.map(entry => entry.entry.id) }
      if (!pkg) return { ...base, state: 'missing' }
      const installed = { ...base, version: pkg.version }
      if (!matchesPluginVersion(pkg.version, range)) return { ...installed, state: 'incompatible' }
      if (!enabled.length) return { ...installed, state: 'disabled' }
      if (enabled.some(entry => entry.fiber?.state === FiberState.ACTIVE && !this.packageBlock(entry))) {
        return { ...installed, state: 'active' }
      }
      if (this.incompatibility(pkg) || enabled.some(entry => entry.error || entry.fiber?.state === FiberState.FAILED)) {
        return { ...installed, state: 'failed' }
      }
      return { ...installed, state: 'pending' }
    })
  }

  /** Package changes stop affected consumers, and restore entries that were waiting for compatible packages. */
  private async reconcilePackageDependencies() {
    for (const rt of this.runtimes.values()) {
      const pkg = this.packages.get(rt.entry.name)
      const blocked = (!this.builtins.has(rt.entry.name) && (!pkg || this.incompatibility(pkg))) || this.packageBlock(rt)
      if (this.isDisabled(rt) || (!blocked && !rt.packageBlocked)) continue
      if (!blocked) {
        this.resumePackageConsumer(rt)
        continue
      }
      await this.lock(rt.entry.name, async () => {
        if (this.isDisabled(rt) || !this.runtimes.has(rt.entry.id)) return
        const pkg = this.packages.get(rt.entry.name)
        const blocked = (!this.builtins.has(rt.entry.name) && (!pkg || this.incompatibility(pkg))) || this.packageBlock(rt)
        if (blocked) {
          await this.stop(rt)
          rt.packageBlocked = true
        } else {
          this.resumePackageConsumer(rt)
        }
      })
    }
  }

  private resumePackageConsumer(rt: Runtime) {
    // An initializer can itself call scan(). Do not hold up this scan while waiting for it to finish.
    this.lock(rt.entry.name, async () => {
      if (!rt.packageBlocked) return
      rt.packageBlocked = false
      await this.start(rt)
    }).catch(error => this.ctx.logger.error(error))
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
    try {
      await this.lock(pkg.name, () => this.reloadPackage(pkg.name))
    } finally {
      await this.reconcilePackageDependencies()
    }
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
    /** The instance's plugins.json */
    file: string
    /** Root of the plugins' data directories (ctx.storage, ctx.baseUrl). Omitted = neither is provided. */
    dataDir?: string
    /** Directories whose child packages are plugins. The market installs into the first. */
    roots: string[]
    /** Watch the roots and reload changed packages. plugins.json `hmr: true` also turns it on. */
    hmr?: boolean
    /** Install the module.registerHooks resolver. Tests turn it off: the hook is process wide. */
    resolver?: boolean
    /** Plugins bundled with the bot, listed next to the installed ones. */
    builtins?: BuiltinPlugin[]
    /** Third-party packages start only once the user trusted them (PluginTrustRequiredError); the WebUI asks. */
    trust?: boolean
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

// A config can hold secrets: salted, so neither a rev nor a mask's token can be brute-forced offline
const REV_SALT = randomBytes(16)

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

/** `file` from the package root with forward slashes; the version only busts caches across updates */
function assetUrl(pkg: PluginPackage, file: string): string {
  return `/plugin-assets/${keyOfPackage(pkg.name)}/${encodeURIComponent(pkg.version)}/${file.split('/').map(encodeURIComponent).join('/')}`
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
