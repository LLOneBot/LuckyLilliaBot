import type { AdapterSections } from '@/common/types'
import { templateSection } from '../config/upgrade'

/** An adapter's section of default_config.json as a new entry: its `enable` is the entry switch now. */
export function fromTemplate<K extends keyof AdapterSections>(key: K): { enabled: boolean; config: Omit<AdapterSections[K], 'enable'> } {
  const { enable, ...config } = templateSection(key)
  return { enabled: !!enable, config }
}
