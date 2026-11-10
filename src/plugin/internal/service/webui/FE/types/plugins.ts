// Mirrors src/plugin/host/index.ts. The WebUI tsconfig has no node types, so the backend module cannot be imported here.

export type PluginState = 'missing' | 'incompatible' | 'pending' | 'loading' | 'active' | 'failed' | 'disposed'

export interface ServiceDeclaration {
  required: string[]
  optional: string[]
  implements: string[]
  /** What the provided services stand for to a user (llbot.service.labels) */
  labels?: Record<string, string>
}

export interface PluginManifest {
  title?: string | Record<string, string>
  description?: string | Record<string, string>
  /** One of CATEGORIES in components/plugins/listing.ts; anything else is listed under "other". */
  category?: string
  icon?: string
  hidden?: boolean
  preview?: boolean
  /** Required plugin package names and their accepted versions (llbot.dependencies). */
  dependencies?: Record<string, string>
}

export interface PluginStatus {
  id: string
  name: string
  version?: string
  packageName?: string
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
  /** Where it takes events from; absent: everywhere. */
  scope?: EntryScope
  /** Its place in the message order; absent: after the ordered ones. */
  rank?: number
  /** It listens to messages, so it has a place in the message order. */
  messages?: boolean
  /** Its listeners or commands threw: the last error, and how often since it started. */
  listenerError?: { at: number; message: string; count: number }
  /** A third-party package the user agreed to run; enabling one that is not asks first. */
  trusted?: boolean
  /** package.json `author` */
  author?: PluginAuthor
  /** The image its package names in `llbot.icon`; absent for a lucide icon */
  iconUrl?: string
  /** It declares details or screenshots, behind 详情 on its card */
  hasDetails?: boolean
}

export interface PluginAuthor {
  name: string
  email?: string
  url?: string
}

/** GET /api/plugins/:id/details */
export interface PluginDetails {
  markdown?: string
  /** URL the markdown's relative image paths resolve against, ending in a slash */
  base: string
  screenshots: { url: string; caption?: string }[]
}

/** Mirrors src/plugin/host/scope.ts */
export interface IdFilter {
  mode: 'allow' | 'deny'
  ids: string[]
}

export interface EntryScope {
  platforms?: string[]
  bots?: string[]
  guilds?: IdFilter
  users?: IdFilter
  direct?: boolean
}

/** What the user decided about plugins' parts of the WebUI (plugins.json `ui`). */
export interface UiPrefs {
  /** contributionKey / pageContributionKey (plugin-host/registry.ts) of what is left out. */
  hidden: string[]
  /** Positions of sidebar pages (pageContributionKey) and of contributions to `list` slots (contributionKey), over their own order */
  order: Record<string, number>
}

export interface UiPrefsPatch {
  hide?: string[]
  show?: string[]
  /** null drops the position */
  order?: Record<string, number | null>
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
  packages?: PackageDependencyInfo[]
  conflicts: { service: string; with: string[] }[]
}

export interface PackageDependencyInfo {
  name: string
  range: string
  version?: string
  entries: string[]
  state: 'missing' | 'incompatible' | 'disabled' | 'pending' | 'active' | 'failed'
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
