import type { BuiltinPlugin } from '../../../host'
import * as Proxy from '.'
import { proxySettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:proxy',
  title: '代理',
  plugin: Proxy,
  // The config dialog tries an address before the entry is switched on
  standby: Proxy.ProxyTestRoutes,
  config: proxySettings,
  manifest: {
    category: 'service',
    icon: 'globe',
    description: {
      zh: '插件访问外网用的代理（http / socks5），比如 AI 网关连 OpenAI。只管插件经 ctx.http 发的请求，Bot 自己登录、收发图片都直连',
      en: 'The proxy (http / socks5) for what plugins send through ctx.http, e.g. the AI gateway calling OpenAI. The bot itself connects directly',
    },
  },
}
