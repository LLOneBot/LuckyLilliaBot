/** The `llbot` field of a plugin's package.json. Its presence is what marks a package as a plugin. */
export interface LLBotManifest {
  /** Plain text, or a map keyed by locale such as `zh` / `en`. */
  description?: string | Record<string, string>
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
  }
  /**
   * ES module extending the WebUI, relative to the package root: sidebar pages, Dashboard cards, a custom
   * config editor. See `@luckylillia/plugin-sdk/webui`. Its directory is served as a whole, so keep the
   * WebUI build in a folder of its own.
   */
  webui?: string
}
