import type { BuiltinPlugin } from '../../../host'
import * as NTQQUniversal from '.'

export const builtin: BuiltinPlugin = {
  // The Satori adapter receives its events from here, so it stays on
  name: 'builtin:ntqq-universal',
  title: '中立层',
  plugin: NTQQUniversal,
  manifest: {
    category: 'service',
    icon: 'network',
    // Pure plumbing with no switch and no settings: not something to manage, so keep it out of the list
    hidden: true,
    description: {
      zh: '把 QQ 的消息和事件转换成 Satori 格式，插件和 Satori 适配器都从这里收消息',
      en: 'Turns QQ messages and events into Satori sessions for plugins and the Satori adapter',
    },
  },
  core: true,
}
