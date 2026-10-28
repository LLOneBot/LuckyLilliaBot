/**
 * The WebUI side of a plugin: the ES module named by `llbot.webui` in package.json. Its default export
 * receives a WebUIContext and registers what the plugin adds to the WebUI.
 *
 * The WebUI hands the module its own `react`, `react/jsx-runtime`, `react-dom` and this module through an
 * import map, so components share its React. Mark all four external when bundling. The `declare`d values below
 * are those the WebUI supplies at runtime.
 */

/**
 * A React component, `React.lazy()` ones included: the WebUI renders plugin components inside Suspense.
 * Typed loosely so that this SDK does not depend on @types/react.
 */
export type Component<P = any> = ((props: P) => any) | (new (props: P) => any) | { readonly $$typeof: symbol }

/** A function component the WebUI supplies, for use in JSX. */
export type WebUIComponent<P = {}> = (props: P) => any

export interface PageOptions {
  /** Unique within the plugin; the WebUI prefixes it with the package name to make the tab id. */
  id: string
  title: string
  /** lucide icon name, from the same list as `llbot.icon`. */
  icon?: string
  /** Rendered without props. */
  component: Component<{}>
  /**
   * Sidebar position, lowest first, shared with the WebUI's own entries: Dashboard 0, 日志 20, 其他配置 30,
   * 插件 40, 关于 1000. Defaults to 100.
   */
  order?: number
  /**
   * A settings page: listed while the plugin is enabled, also when it waits for services or fails. Once it is
   * disabled the sidebar drops the page, but the plugin card still opens it, under a notice that the settings
   * take effect once the plugin runs. Other pages only show while the plugin runs.
   */
  settings?: boolean
}

/** Named places in the WebUI layout, with the props their components get. */
export interface Slots {
  /** Cards below the built-in ones on the Dashboard. */
  dashboard: {}
}

export interface ConfigEditorProps<T = any> {
  /** The whole config with defaults filled in. */
  value: T
  onChange(value: T): void
  /** schemastery `toJSON()` of the plugin's Config, or null. */
  schema: unknown
  defaults: unknown
  /** Messages from the last rejected save, keyed by dotted path (`''` for the root). */
  errors: Record<string, string>
}

export interface FieldProps<T = any> {
  value: T
  onChange(value: T): void
  /** Meta of the schema node: description, default, role options and so on. */
  meta: Record<string, any>
  error?: string
}

export interface ApiOptions {
  method?: string
  /** Sent as JSON unless it is a string or FormData. */
  body?: unknown
}

export interface WebUIContext {
  /** The package this module belongs to. */
  readonly plugin: { readonly name: string }
  /** Adds a sidebar page, shown while the plugin runs. */
  page(options: PageOptions): () => void
  /** Adds a component to a named place in the layout, shown while the plugin runs. */
  slot<K extends keyof Slots>(name: K, component: Component<Slots[K]>, options?: { order?: number }): () => void
  /**
   * Replaces the generated form in this plugin's config dialog, which also opens while the plugin is
   * disabled. Saving still goes through the bot, which validates against the plugin's Config.
   */
  config(component: Component<ConfigEditorProps>): () => void
  /** Renders schema fields declared with `.role(role)` in every plugin's generated config form. */
  field(role: string, component: Component<FieldProps>): () => void
  /** Calls the bot's HTTP API with the WebUI login; resolves with `data` of a `{ success, data }` reply. */
  api<T = any>(path: string, options?: ApiOptions): Promise<T>
  /** Listens to a server-sent event stream of the bot's API, by event name; returns the unsubscribe function. */
  events(path: string, listeners: Record<string, (data: any) => void>): () => void
  /** Defaults to `success`. */
  toast(message: string, type?: 'success' | 'error' | 'warning'): void
}

/**
 * The module's default export. It may return a cleanup function, run when the module is replaced by a
 * newer version of the plugin. Everything registered through `ctx` is removed then as well.
 */
export type WebUIPlugin = (ctx: WebUIContext) => void | (() => void)

/** The WebUIContext of the plugin whose component is rendering. Supplied by the WebUI at runtime. */
export declare function usePluginContext(): WebUIContext

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

/** How the WebUI sees a plugin entry, from the plugin list. */
export interface PluginEntryStatus {
  id: string
  name: string
  title?: string
  disabled: boolean
  state: PluginState
  error?: string
  /** Services the entry waits for while pending */
  missingDeps: string[]
  /** What an enabled builtin says about its settings, e.g. that something still has to be filled in */
  notice?: string
}

/**
 * The entry of the plugin whose component is rendering, kept current; undefined until the plugin list loads.
 * A package with several entries gets its first one.
 */
export declare function usePluginStatus(): PluginEntryStatus | undefined

export interface PluginConfigState<T = any> {
  /** The whole config with defaults filled in, secrets masked; null until loaded. */
  value: T | null
  setValue(value: T): void
  /** schemastery `toJSON()` of the plugin's Config, or null. */
  schema: unknown
  /** Why loading failed. */
  error: string
  /** Messages from the last rejected save, keyed by dotted path (`''` for the root). */
  errors: Record<string, string>
  saving: boolean
  /**
   * Saves `value` (or `next`) through the bot, which validates it against the Config and the plugin restarts
   * with it. Says how it went in a toast; resolves whether it saved. A save that would clobber a newer one
   * reloads instead.
   */
  save(next?: T, options?: { message?: string }): Promise<boolean>
  /** Empties a stored secret on the next save: sending it back masked or blank keeps it. */
  clearSecret(path: string): void
}

/** The config of the plugin whose component is rendering (its first entry), loaded on mount. */
export declare function usePluginConfig<T = any>(): PluginConfigState<T>

export interface SchemaFormProps<T = any> {
  /** schemastery `toJSON()` output, as in PluginConfigState and ConfigEditorProps. */
  schema: unknown
  value: T
  onChange(value: T): void
  errors?: Record<string, string>
  /** Only these top-level fields, in this order. */
  fields?: string[]
  /** See PluginConfigState.clearSecret; without it secret fields have no clear button. */
  onClearSecret?(path: string): void
}

/** The form the WebUI generates from a schema, or some of its fields. Field roles registered with `ctx.field()` apply. */
export declare const SchemaForm: WebUIComponent<SchemaFormProps>

export interface SchemaSettingsProps {
  /** Only these top-level fields of the Config, in this order. */
  fields?: string[]
  /** Top-level fields boxed under a title, after the rest; `collapsed` starts folded. */
  sections?: { title: string; fields: string[]; collapsed?: boolean }[]
  /** Shown next to the title, e.g. the documentation. */
  links?: { label: string; href: string }[]
  /** Below the form, above the save button; a function gets the config being edited. */
  children?: unknown | ((config: PluginConfigState) => unknown)
}

/**
 * A whole settings page for `ctx.page({ settings: true })`: the plugin's title and description, the form
 * generated from its Config and a save button.
 */
export declare const SchemaSettings: WebUIComponent<SchemaSettingsProps>

/** A listen address: the machine's addresses to pick from, or one typed in. The form uses it for `.role('host')`. */
export declare const HostInput: WebUIComponent<{ value: string; onChange(value: string): void }>
