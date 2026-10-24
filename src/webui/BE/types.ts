import { Config } from '@/common/types'
import { SelfInfo } from '@/ntqqapi/types'

export interface ResConfig{
  config: Config,
  selfInfo: SelfInfo
  /** Fields pinned by an LLBOT_* variable: shown read-only, never written to the file. */
  envLocked: { path: string; env: string }[]
  /** The instance whose settings these are. */
  instance: string
}

/** A partial config: nested objects merge per key, arrays and scalars replace whole (ConfigService.patch). */
export interface ReqConfig {
  config: Partial<Config>
}
