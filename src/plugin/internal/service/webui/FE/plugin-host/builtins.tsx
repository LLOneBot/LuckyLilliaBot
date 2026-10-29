import type { WebUIPlugin } from '@luckylillia/plugin-sdk/webui'

interface ClientModule {
  /** The builtin entry it belongs to, e.g. `builtin:satori` */
  name: string
  default: WebUIPlugin
}

// Builtin plugins (src/plugin/internal/<category>/<name>/) keep their WebUI next to their code, in
// `client/index.ts(x)`, written against the public SDK like a package's `llbot.webui` module; it ships inside this
// bundle instead of being fetched
const modules = import.meta.glob<ClientModule>('../../../../*/*/client/index.{ts,tsx}', { eager: true })

export const BUILTIN_CLIENTS: Record<string, WebUIPlugin> = Object.fromEntries(
  Object.values(modules).map(module => [module.name, module.default]),
)
