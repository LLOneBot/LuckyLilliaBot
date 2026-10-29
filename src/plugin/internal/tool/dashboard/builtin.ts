import type { BuiltinPlugin } from '../../../host'
import { Dashboard } from '.'

export const builtin: BuiltinPlugin = {
  name: 'builtin:dashboard',
  title: 'Dashboard',
  plugin: Dashboard,
  manifest: {
    category: 'tool',
    icon: 'layout-dashboard',
    description: {
      zh: '首页：运行时间、LLBot 和系统的资源占用，别的插件也往这里放卡片',
      en: 'The front page: uptime and resource usage of LLBot and the machine, and the cards other plugins put there',
    },
  },
}
