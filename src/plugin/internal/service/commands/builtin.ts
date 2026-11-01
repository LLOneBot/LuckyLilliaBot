import type { BuiltinPlugin } from '../../../host'
import * as Commands from '.'
import { commandsSettings } from './settings'

export const builtin: BuiltinPlugin = {
  // Every plugin with commands injects `commands`: switching it off would stop them all
  name: 'builtin:commands',
  title: '指令',
  plugin: Commands,
  config: commandsSettings,
  core: true,
  manifest: {
    category: 'service',
    icon: 'terminal',
    service: { implements: ['commands'], labels: { commands: '指令' } },
    description: {
      zh: '插件的指令：前缀、主人、help，列出所有指令和重名的指令；QQ 官方机器人的指令菜单也从这里同步',
      en: 'Plugin commands: prefixes, owners, help, the list of every command and the clashing ones; also fills the QQ official bot\'s command menus',
    },
  },
}
