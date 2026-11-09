import { PluginsPage } from '../components/plugins'
import { useRegistry, WEBUI } from '../plugin-host/registry'
import AboutPage from './AboutPage'
import WebuiPage from './WebuiPage'

let registered = false

/**
 * The pages of builtin:webui. Registered straight into the registry, not through a ctx like the other builtins:
 * they reach into the shell (plugin management and its own settings). The plugin page stays available so the user
 * can always manage plugins and restore hidden pages. Bot settings are shown with what uses them: WebUI here,
 * log files on the logs page, the message cache on the NTQQ page, the music card service on the OneBot 11 page.
 */
export function registerCorePages() {
  if (registered) return
  registered = true
  const { add } = useRegistry.getState()
  add({ kind: 'page', owner: WEBUI, key: 'plugins', title: '插件', icon: 'puzzle', order: 40, settings: false, locked: true, component: PluginsPage })
  add({ kind: 'page', owner: WEBUI, key: 'webui', title: '页面设置', icon: 'settings', order: 900, settings: true, component: WebuiPage })
  add({ kind: 'page', owner: WEBUI, key: 'about', title: '关于', icon: 'info', order: 1000, settings: false, component: AboutPage })
}
