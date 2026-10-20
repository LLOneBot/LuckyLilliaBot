/**
 * The WebUI side of a plugin: the ES module named by `llbot.webui` in package.json. Its default export
 * receives a WebUIContext and registers what the plugin adds to the WebUI.
 *
 * The WebUI hands the module its own `react`, `react/jsx-runtime`, `react-dom` and this module through an
 * import map, so components share its React. Mark all four external when bundling.
 */

/**
 * A React component, `React.lazy()` ones included: the WebUI renders plugin components inside Suspense.
 * Typed loosely so that this SDK does not depend on @types/react.
 */
export type Component<P = any> = ((props: P) => any) | (new (props: P) => any) | { readonly $$typeof: symbol }

export interface PageOptions {
  /** Unique within the plugin; the WebUI prefixes it with the package name to make the tab id. */
  id: string
  title: string
  /** lucide icon name, from the same list as `llbot.icon`. */
  icon?: string
  /** Rendered without props. */
  component: Component<{}>
  /** Sidebar position among plugin pages, lowest first. Defaults to 100. */
  order?: number
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
