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
}
