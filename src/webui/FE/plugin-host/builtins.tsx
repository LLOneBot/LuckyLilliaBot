import type { WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { WebQQPage } from '../components/WebQQ'

interface ClientModule {
  /** The builtin entry it belongs to, e.g. `builtin:satori` */
  name: string
  default: WebUIPlugin
}

// Builtin plugins keep their WebUI next to their code, in `client/index.ts(x)`, written against the public SDK
// like a package's `llbot.webui` module; it ships inside this bundle instead of being fetched
const modules = import.meta.glob<ClientModule>(['../../../**/client/index.{ts,tsx}', '!../../../webui/**'], { eager: true })

export const BUILTIN_CLIENTS: Record<string, WebUIPlugin> = {
  ...Object.fromEntries(Object.values(modules).map(module => [module.name, module.default])),
  // Not moved out yet: WebQQ still reaches into the shell (its fullscreen tab, the sidebar, settings and stores)
  'builtin:webqq': (ctx) => {
    ctx.page({ id: 'webqq', title: 'WebQQ', icon: 'message-square', component: WebQQPage, order: 50 })
  },
}
