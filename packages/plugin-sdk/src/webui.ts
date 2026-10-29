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
   * Drawn above the page where the Dashboard has its title, on wide screens only; rendered without props. Without
   * it that room stays empty.
   */
  header?: Component<{}>
  /**
   * Sidebar position, lowest first, shared with the builtin pages: Dashboard 0, 日志 20, 其他配置 30, 插件 40,
   * 关于 1000. Defaults to 100.
   */
  order?: number
  /**
   * A settings page: listed while the plugin is enabled, also when it waits for services or fails. Once it is
   * disabled the sidebar drops the page, but the plugin card still opens it, under a notice that the settings
   * take effect once the plugin runs. Other pages only show while the plugin runs.
   */
  settings?: boolean
}

/**
 * How a slot shows its contributions:
 * - `list` every one, in `order`
 * - `single` one, the highest `priority`, and what the slot shows by itself while none is there
 * - `keyed` one per key: the slot asks for a key (`match` of `Slot`), the highest `priority` among the contributions
 *   with that `match` shows, else the slot's own content
 * - `chain` every one, wrapped around each other in `order`, the first outermost: each gets what the rest drew in
 *   `next`, around the slot's own content, and may wrap it, change it or pass it through
 * Replacing what is there is only ever possible where a slot is `single` or `keyed`, changing it where it is `chain`.
 */
export type SlotCardinality = 'list' | 'single' | 'keyed' | 'chain'

/**
 * The slots, by name, with the props the slot hands its contributions and the options they describe themselves
 * with. Names are dotted paths of where they are: `dashboard.cards`, `webqq.chat.actions`. A plugin declaring one
 * (`ctx.declareSlot`) adds it here by declaration merging, for the plugins filling it to type against:
 *
 *     declare module '@luckylillia/plugin-sdk/webui' {
 *       interface SlotMap { 'my-plugin.item.actions': { props: { item: Item }; options: {} } }
 *     }
 *
 * The props of a `chain` slot include `next`, which the slot passes on itself.
 */
export interface SlotMap {
  /** Lines of the notice bar at the top of the WebUI: render StatusNotice ones, or nothing at all. */
  'shell.notices': { props: {}; options: {} }
  /** Sections of the settings dialog (the gear in the sidebar), for preferences of this browser. */
  'settings.sections': { props: {}; options: { title: string } }
  /** Buttons next to 重新扫描 on the plugin page. The plugin page has nothing to replace: it is how users keep plugins in check. */
  'plugins.toolbar': { props: {}; options: {} }
  /** Buttons on each card of the plugin page, before its own. */
  'plugins.card.actions': { props: { plugin: PluginEntryStatus }; options: {} }
  /** Cards on the Dashboard, declared by the Dashboard plugin. It draws the card, its title and width; the component, its inside. */
  'dashboard.cards': { props: {}; options: DashboardCardOptions }
  /** The title of the Dashboard, `single`: a contribution replaces the Dashboard's own. */
  'dashboard.header': { props: {}; options: {} }
  /** Buttons in the header of a WebQQ chat, declared by WebQQ. */
  'webqq.chat.actions': { props: { chat: WebQQChat }; options: {} }
  /**
   * How WebQQ draws a message element, `keyed` by its `elementType` (`'14'` for markdown): a contribution replaces
   * WebQQ's own drawing of that type, or draws one WebQQ has none for. `message` is missing in a reply's quote.
   */
  'webqq.message.element': { props: { element: WebQQElement; message?: WebQQMessage }; options: {} }
  /** The bubble of a WebQQ message, `chain`: `next` is the bubble as drawn so far. */
  'webqq.message.bubble': { props: { message: WebQQMessage; next: unknown }; options: {} }
}

export interface DashboardCardOptions {
  title?: string
  /** lucide icon name, from the `llbot.icon` list. */
  icon?: string
  /**
   * About a third of a row (default), two thirds, or the whole row; the cards of a row share out the room it has
   * left, so one rendering nothing leaves no gap.
   */
  size?: 'normal' | 'wide' | 'full'
}

/** The chat open in WebQQ. */
export interface WebQQChat {
  /** 1 private, 2 group, 100 temporary */
  chatType: number
  /** QQ number of the friend, number of the group */
  peerId: string
  name: string
}

/** A message as WebQQ shows it. */
export interface WebQQMessage {
  msgId: string
  msgSeq: string
  /** 1 private, 2 group, 100 temporary */
  chatType: number
  /** QQ number of the friend, number of the group */
  peerId: string
  senderUin: string
  senderName: string
  /** Unix seconds */
  time: number
  /** Its text elements, joined */
  text: string
  /** Sent by the logged-in account */
  self: boolean
}

/** A message element as NTQQ has it: `elementType` and the field of that type, e.g. `markdownElement: { content }`. */
export interface WebQQElement {
  elementType: number
  [field: string]: unknown
}

export type SlotContribution<K extends keyof SlotMap> = SlotMap[K]['options'] & {
  /**
   * Unique among this plugin's contributions to the slot, and kept from version to version: the plugin page hides
   * and orders them by it.
   */
  id: string
  /** What the plugin page calls it; defaults to its `title` option, then the id. */
  label?: string
  component: Component<SlotMap[K]['props']>
  /** Lowest first in a `list` or a `chain` (outermost). Defaults to 100. */
  order?: number
  /** In a `single` slot, the highest one shows, in a `keyed` slot the highest for the key. Defaults to 0. */
  priority?: number
  /** In a `keyed` slot, the key this contribution draws. */
  match?: string
}

export interface SlotDeclaration {
  /** What the plugin page calls it, next to what fills it. */
  title: string
  description?: string
  cardinality: SlotCardinality
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
  /**
   * Adds a contribution to a slot, the WebUI's or one another plugin declared; it shows while this plugin runs. One
   * into a slot nobody declares waits for it, and the plugin page says so. Throws for a missing or repeated `id`.
   */
  slot<K extends keyof SlotMap>(name: K, contribution: SlotContribution<K>): () => void
  /**
   * Declares a slot of this plugin's own UI for other plugins to fill; render it with `Slot` where it goes. Name it
   * after the plugin and the place (`my-plugin.item.actions`); a name taken already throws.
   */
  declareSlot(name: string, declaration: SlotDeclaration): () => void
  /**
   * Replaces the generated form in this plugin's config dialog, which also opens while the plugin is
   * disabled. Saving still goes through the bot, which validates against the plugin's Config.
   */
  config(component: Component<ConfigEditorProps>): () => void
  /** Renders schema fields declared with `.role(role)` in every plugin's generated config form. */
  field(role: string, component: Component<FieldProps>): () => void
  /** Calls the bot's HTTP API with the WebUI login; resolves with `data` of a `{ success, data }` reply. */
  api<T = any>(path: string, options?: ApiOptions): Promise<T>
  /**
   * fetch() with the WebUI login, for what `api()` does not cover (raw bodies, streams, error bodies). Asks for
   * the password the way the WebUI does; the response may be an error one.
   */
  fetch(path: string, init?: RequestInit): Promise<Response>
  /** The path with the WebUI login in its query: for `<img>`, `<video>`, downloads and the like, which send no headers. */
  authUrl(path: string): string
  /** Address of one of this plugin's pages, for links and `window.open()`; `fullscreen` opens it without the sidebar. */
  pageHref(id: string, options?: { fullscreen?: boolean }): string
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

/** Every plugin entry the WebUI lists, kept current; null until the list loads. */
export declare function usePlugins(): PluginEntryStatus[] | null

export interface BotInfo {
  sid: string
  platform: string
  selfId: string
  /** @satorijs/protocol Status: 0 offline, 1 online, 2 connecting, 3 disconnecting, 4 reconnecting */
  status: number
  name?: string
  avatar?: string
}

/** The accounts plugins chat through (`ctx.bots` on the bot), kept current; null until the first answer. */
export declare function useBots(): BotInfo[] | null

export interface PageView {
  /** Opened on its own, without the sidebar and header (`ctx.pageHref(id, { fullscreen: true })`). */
  fullscreen: boolean
}

/** How the page being rendered is shown. */
export declare function usePageView(): PageView

/** The WebUI sidebar, e.g. for a page that wants the room. */
export declare function useSidebar(): { collapsed: boolean; setCollapsed(collapsed: boolean): void }

export interface StatusNoticeProps {
  children?: unknown
  /** Label of the button. */
  action?: string
  /** Id of the plugin page the button opens; the line is left out while that page is open. */
  page?: string
}

/** A line of the notice bar, for components in the `shell.notices` slot. */
export declare const StatusNotice: WebUIComponent<StatusNoticeProps>

export type SlotProps<K extends keyof SlotMap> = {
  name: K
  /** For a `keyed` slot: which key to draw. */
  match?: string
  /**
   * What the slot shows by itself: while it has no contribution (`single`, `keyed`, or a `list` left empty), and
   * innermost in a `chain`.
   */
  children?: unknown
  /**
   * Draws what goes around each contribution, e.g. a card; the contribution's error boundary is inside it. The
   * WebUI's own slots do this for you.
   */
  wrap?: (element: unknown, contribution: { id: string; plugin: string; options: Record<string, unknown> }) => unknown
} & ({} extends Omit<SlotMap[K]['props'], 'next'>
  ? { props?: Omit<SlotMap[K]['props'], 'next'> }
  : { props: Omit<SlotMap[K]['props'], 'next'> })

/**
 * Renders a slot this plugin declared, where it goes: the contributions of running plugins in order, minus what
 * the user hid, each with the context of the plugin it comes from and in its own error boundary.
 */
export declare function Slot<K extends keyof SlotMap>(props: SlotProps<K>): any

/**
 * For a `keyed` slot: the keys a contribution draws right now (a running plugin's, not hidden). WebQQ uses it to
 * show a message whose only elements are ones it cannot draw itself.
 */
export declare function useSlotMatches(name: keyof SlotMap): string[]

/** An icon from the `llbot.icon` list by its lucide name; unknown names get the puzzle piece. */
export declare const Icon: WebUIComponent<{ name?: string; size?: number; className?: string }>
