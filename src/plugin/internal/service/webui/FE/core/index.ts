import { PluginsPage } from '../components/plugins'
import { useRegistry, WEBUI } from '../plugin-host/registry'
import AboutPage from './AboutPage'
import OtherSettingsPage from './OtherSettingsPage'

let registered = false

/**
 * The pages of builtin:webui. Registered straight into the registry, not through a ctx like the other builtins:
 * they reach into the shell (plugin management, the bot settings), and the two locked ones are what the user needs
 * to get anything back, so nothing may hide them.
 */
export function registerCorePages() {
  if (registered) return
  registered = true
  const { add } = useRegistry.getState()
  add({ kind: 'page', owner: WEBUI, key: 'other', title: '其他配置', icon: 'sliders', order: 30, settings: false, locked: true, component: OtherSettingsPage })
  add({ kind: 'page', owner: WEBUI, key: 'plugins', title: '插件', icon: 'puzzle', order: 40, settings: false, locked: true, component: PluginsPage })
  add({ kind: 'page', owner: WEBUI, key: 'about', title: '关于', icon: 'info', order: 1000, settings: false, component: AboutPage })
}
