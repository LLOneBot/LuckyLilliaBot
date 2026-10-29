/**
 * Where the WebUI plugin page lists a plugin, in this order:
 * - `protocol` 协议端: logs an account in, connects a platform (the NTQQ protocol, the QQ official bot)
 * - `adapter` 适配器: lets outside frameworks in through a bot protocol (OneBot 11, Satori, Milky)
 * - `chat` 消息互动: answers messages (auto replies, games)
 * - `tool` 工具: anything else users switch on for itself (WebQQ, notifications, blocklists)
 * - `service` 依赖组件: provides services other plugins need (databases, renderers)
 * - `other` 其他: the rest, and plugins that declare none
 */
export type PluginCategory = 'protocol' | 'adapter' | 'chat' | 'tool' | 'service' | 'other'

/** The `llbot` field of a plugin's package.json. Its presence is what marks a package as a plugin. */
export interface LLBotManifest {
  /** Plain text, or a map keyed by locale such as `zh` / `en`. */
  description?: string | Record<string, string>
  /** Where the WebUI plugin page lists it; any other value counts as `other`. */
  category?: PluginCategory
  /** lucide icon name in kebab case, e.g. `message-square`. */
  icon?: string
  /** Loadable, but left out of the WebUI plugin list. */
  hidden?: boolean
  /** Flags the plugin as work in progress in the WebUI. */
  preview?: boolean
  /**
   * Services this plugin needs, can make use of and provides, readable without loading its code: the
   * WebUI shows them and warns about missing providers and conflicts. `inject` is still what gates loading.
   */
  service?: {
    /** Needed to run; list them in `inject` as well. */
    required?: string[]
    /** Used when present, e.g. through `ctx.inject([...], ...)` inside the plugin. */
    optional?: string[]
    /** Services this plugin provides. Two enabled plugins providing the same one conflict. */
    implements?: string[]
    /**
     * What the services it provides stand for to a user, e.g. `{ account: 'NTQQ 账号登录' }`: the WebUI says
     * what a plugin waiting for one of them waits for with it.
     */
    labels?: Record<string, string>
  }
  /**
   * ES module extending the WebUI, relative to the package root: sidebar pages, Dashboard cards, a custom
   * config editor. See `@luckylillia/plugin-sdk/webui`. Its directory is served as a whole, so keep the
   * WebUI build in a folder of its own.
   */
  webui?: string
}
