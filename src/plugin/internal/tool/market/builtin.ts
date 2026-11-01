import type { BuiltinPlugin } from '../../../host'
import * as Market from '.'
import { marketSettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:market',
  title: '插件市场',
  plugin: Market,
  config: marketSettings,
  manifest: {
    category: 'tool',
    icon: 'store',
    description: {
      zh: '在 WebUI 里搜索、安装、更新和卸载 npm 上的插件（带 luckylillia-plugin 关键词的包）',
      en: 'Search, install, update and remove plugins from npm (packages with the luckylillia-plugin keyword) in the WebUI',
    },
  },
}
