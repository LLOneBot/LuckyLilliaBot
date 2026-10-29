import type { BuiltinPlugin } from '../../../host'
import { adapterEntry } from '../adapterEntry'
import SatoriAdapter from './adapter'
import { SatoriSchema, satoriSettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:satori',
  title: 'Satori',
  config: satoriSettings,
  plugin: adapterEntry('builtin:satori', SatoriAdapter, SatoriSchema, config => ({ ffmpeg: config.ffmpeg })),
  manifest: {
    category: 'adapter',
    icon: 'cpu',
    service: { implements: ['satori'] },
    description: { zh: 'Satori 协议适配器', en: 'Satori protocol adapter' },
  },
}
