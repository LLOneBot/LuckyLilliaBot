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
      zh: '在 WebUI 里浏览市场目录、安装、更新和卸载收录的 npm 插件',
      en: 'Browse the market catalog and install, update or remove listed npm plugins in the WebUI',
    },
  },
}
