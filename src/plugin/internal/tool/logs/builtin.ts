import type { BuiltinPlugin } from '../../../host'
import { Logs } from '.'

export const builtin: BuiltinPlugin = {
  name: 'builtin:logs',
  title: '日志',
  plugin: Logs,
  manifest: {
    category: 'tool',
    icon: 'scroll-text',
    description: { zh: '在 WebUI 里实时看日志', en: 'Live logs in the WebUI' },
  },
}
