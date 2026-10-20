import type { WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { WebQQPage } from '../components/WebQQ'

/** WebUI parts of builtin plugins: bundled with the WebUI, but registered the way a plugin module would. */
export const BUILTIN_CLIENTS: Record<string, WebUIPlugin> = {
  'builtin:webqq': (ctx) => {
    ctx.page({ id: 'webqq', title: 'WebQQ', icon: 'message-square', component: WebQQPage, order: 0 })
  },
}
