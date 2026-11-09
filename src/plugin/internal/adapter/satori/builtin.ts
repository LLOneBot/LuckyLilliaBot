import type { BuiltinPlugin } from '../../../host'
import { adapterEntry } from '../adapterEntry'
import SatoriAdapter from './adapter'
import { SatoriSchema, satoriSettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:satori',
  title: 'Satori',
  config: satoriSettings,
  // Not waiting for the NT account: it serves the QQ official bot as well
  plugin: adapterEntry('builtin:satori', SatoriAdapter, SatoriSchema),
  manifest: {
    category: 'adapter',
    icon: 'cpu',
    service: { implements: ['satori'] },
    description: { zh: '支持全部协议端的 Satori 适配器', en: 'Supports all protocol backends through Satori' },
  },
}
