// Mirrors src/plugin/host/index.ts. The WebUI tsconfig has no node types, so the backend module cannot be imported here.

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

export interface ServiceDeclaration {
  required: string[]
  optional: string[]
  implements: string[]
}

export interface PluginManifest {
  description?: string | Record<string, string>
  /** One of CATEGORIES in components/plugins/listing.ts; anything else is listed under "other". */
  category?: string
  icon?: string
  hidden?: boolean
  preview?: boolean
}

export interface PluginStatus {
  id: string
  name: string
  version?: string
  description?: string
  manifest: PluginManifest
  disabled: boolean
  state: PluginState
  error?: string
  missingDeps: string[]
  reloadCount: number
  hasConfig?: boolean
  /** Ships with the bot: one instance, configured on its own settings tab. */
  builtin?: boolean
  /** A builtin that cannot be disabled. */
  core?: boolean
  title?: string
  service: ServiceDeclaration
  /** URL of the plugin's WebUI module; it changes when the plugin is reloaded. */
  webui?: string
  /** What an enabled builtin says about its settings, e.g. that something still has to be filled in. */
  notice?: string
}

export interface DependencyInfo {
  name: string
  required: boolean
  available: boolean
  /** Entry providing it right now; absent when nothing does or the bot itself does. */
  provider?: string
  /** Other entries declaring that they implement it. */
  candidates: string[]
}

export interface DependencyReport {
  dependencies: DependencyInfo[]
  conflicts: { service: string; with: string[] }[]
}

export type ReloadResult = { status: 'reloaded' } | { status: 'restart-required'; reason: string }

export interface ConfigIssue {
  message: string
  path: string[]
}

export interface PluginDescription {
  /** schemastery toJSON() output: `{ uid, refs }` */
  schema: { uid: number; refs: Record<string, unknown> } | null
  defaults: unknown
  /** What is stored: the diff against the defaults. */
  config: unknown
  /** What the plugin runs with: the defaults filled in. */
  effective: unknown
  /** Pass back as `ifRev` so a write that would clobber a newer edit is rejected. */
  rev: string
  /** Dotted paths of fields that come back masked; sending the mask back keeps the stored value. */
  secrets?: string[]
}
