import { Config } from '@/common/types'

/** The bot settings; what plugins do, the account included, they say through their own routes. */
export interface ResConfig{
  config: Config,
  /** Fields pinned by a flag (`--webui-port`) or an LLBOT_* variable: shown read-only, never written to the file. */
  envLocked: { path: string; by: string }[]
  /** The instance whose settings these are. */
  instance: string
}

/** A partial config: nested objects merge per key, arrays and scalars replace whole (ConfigService.patch). */
export interface ReqConfig {
  config: Partial<Config>
}
