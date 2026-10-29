import type { BuiltinPlugin } from '../../../host'
import { adapterEntry } from '../adapterEntry'
import MilkyAdapter from './adapter'
import { MilkySchema, milkySettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:milky',
  title: 'Milky',
  config: milkySettings,
  plugin: adapterEntry('builtin:milky', MilkyAdapter, MilkySchema),
  manifest: {
    category: 'adapter',
    icon: 'milk',
    service: { implements: ['milky'] },
    description: { zh: 'Milky 协议适配器', en: 'Milky protocol adapter' },
  },
}
