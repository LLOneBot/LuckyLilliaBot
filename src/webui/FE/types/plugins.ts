// Mirrors src/plugin/index.ts. The WebUI tsconfig has no node types, so the backend module cannot be imported here.

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

export interface ServiceDeclaration {
  required: string[]
  optional: string[]
  implements: string[]
}

export interface PluginManifest {
  description?: string | Record<string, string>
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
  /** App tab id holding the settings of a builtin. */
  settings?: string
  service: ServiceDeclaration
  /** URL of the plugin's WebUI module; it changes when the plugin is reloaded. */
  webui?: string
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
  config: unknown
}
