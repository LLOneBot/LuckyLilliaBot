import type { WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { WebQQPage } from '../components/WebQQ'
import OneBotConfigPage from '../components/config/OneBotConfigPage'
import SatoriConfig from '../components/config/SatoriConfig'
import MilkyConfig from '../components/config/MilkyConfig'
import EmailConfigPage from '../components/config/EmailConfigPage'

/** WebUI parts of builtin plugins: bundled with the WebUI, but registered the way a plugin module would. */
export const BUILTIN_CLIENTS: Record<string, WebUIPlugin> = {
  'builtin:onebot11': (ctx) => {
    ctx.page({ id: 'onebot', title: 'OneBot 11', icon: 'radio', component: OneBotConfigPage, order: 10, settings: true })
  },
  'builtin:satori': (ctx) => {
    ctx.page({ id: 'satori', title: 'Satori', icon: 'cpu', component: SatoriConfig, order: 11, settings: true })
  },
  'builtin:milky': (ctx) => {
    ctx.page({ id: 'milky', title: 'Milky', icon: 'milk', component: MilkyConfig, order: 12, settings: true })
  },
  'builtin:email-notification': (ctx) => {
    ctx.page({ id: 'email', title: '邮件通知', icon: 'mail', component: EmailConfigPage, order: 13, settings: true })
  },
  'builtin:webqq': (ctx) => {
    ctx.page({ id: 'webqq', title: 'WebQQ', icon: 'message-square', component: WebQQPage, order: 50 })
  },
}

/** Tab ids of the pages above: App has to recognise them before the plugin list has loaded. */
export const BUILTIN_PAGE_IDS = ['onebot', 'satori', 'milky', 'email', 'webqq']
