// Mirrors src/plugin/index.ts. The WebUI tsconfig has no node types, so the backend module cannot be imported here.

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

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
