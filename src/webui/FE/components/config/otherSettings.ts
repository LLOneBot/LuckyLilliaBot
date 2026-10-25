import { Config, ResConfig } from '../../types'

export type EnvLock = ResConfig['envLocked'][number]

/**
 * What the other-settings page saves: only the keys it edits, so it never writes back stale copies of the
 * adapter sections. Env-pinned fields are dropped as well (the server drops them too).
 */
export function otherSettings(config: Config, envLocked: EnvLock[]): Partial<Config> {
  const sections: Partial<Config> = structuredClone({
    webui: config.webui,
    log: config.log,
    enableLocalFile2Url: config.enableLocalFile2Url,
    msgCacheExpire: config.msgCacheExpire,
    musicCardSignUrl: config.musicCardSignUrl,
  })
  for (const { path } of envLocked) {
    const keys = path.split('.')
    let parent: unknown = sections
    for (const key of keys.slice(0, -1)) parent = (parent as Record<string, unknown> | undefined)?.[key]
    if (parent && typeof parent === 'object') delete (parent as Record<string, unknown>)[keys[keys.length - 1]]
  }
  return sections
}
