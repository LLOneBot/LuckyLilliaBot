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
      zh: '管理指令前缀、别名和使用权限，查看全部指令及重名提示；同步 QQ 官方机器人的指令菜单',
      en: 'Manage command prefixes, aliases and permissions, view all commands and conflicts, and synchronize QQ official bot command menus',
    },
  },
}
