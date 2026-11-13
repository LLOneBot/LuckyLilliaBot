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
  /** Its name in the WebUI, e.g. `关键词回复`; the package name without `luckylillia-plugin-` otherwise. Like `description`. */
  title?: string | Record<string, string>
  /** A description string, e.g. `自动回复消息`; also accepts a map keyed by locale such as `zh` / `en`. */
  description?: string | Record<string, string>
  /** Where the WebUI plugin page lists it; any other value counts as `other`. */
  category?: PluginCategory
  /**
   * A lucide icon name in kebab case, e.g. `message-square` (the WebUI has a set of them), or an image in the package:
   * a path ending in .png / .jpg / .jpeg / .gif / .webp / .svg, e.g. `assets/icon.png`. Square, at least 96px.
   */
  icon?: string
  /**
   * A Markdown file in the package introducing the plugin, e.g. `docs/details.md`: its card in the WebUI gets a
   * 详情 button. Images in it are paths inside the package relative to the file, or http(s) URLs.
   */
  details?: string
  /** Images in the package showing it at work, above the details; `{ src, caption }` for one with a caption. */
  screenshots?: (string | { src: string; caption?: string })[]
  /** Loadable, but left out of the WebUI plugin list. */
  hidden?: boolean
  /** Flags the plugin as work in progress in the WebUI. */
  preview?: boolean
  /**
   * Required plugin packages, by full npm package name and semver range. The market installs them as separate
   * plugins; the host requires matching installed versions. Keep service requirements in `inject` as well.
   * Unlike package.json `dependencies`, these never become private copies in this package's node_modules.
   */
  dependencies?: Record<string, string>
  /**
   * Services this plugin needs, can make use of and provides, readable without loading its code: the
   * WebUI shows them and warns about missing providers and conflicts. `inject` still gates service availability.
   */
  service?: {
    /** Needed to run; list them in `inject` as well. */
    required?: string[]
    /** Used when present, e.g. through `ctx.inject([...], ...)` inside the plugin. */
    optional?: string[]
    /** Services this plugin provides. Two enabled plugins providing the same one conflict. */
    implements?: string[]
    /**
     * What the services it provides stand for to a user, e.g. `{ translator: '翻译服务' }`: the WebUI says
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
