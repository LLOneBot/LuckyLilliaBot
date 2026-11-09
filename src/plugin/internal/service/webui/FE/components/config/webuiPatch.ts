import { Config, ResConfig } from '../../types'

export type EnvLock = ResConfig['envLocked'][number]

/** What the WebUI page saves: where it listens, less what a flag or a variable pins. */
export function webuiPatch(webui: Pick<Config['webui'], 'host' | 'port'>, locked: EnvLock[]): Partial<Config['webui']> {
  const patch: Partial<Config['webui']> = { host: webui.host, port: webui.port }
  for (const { path } of locked) {
    if (path === 'webui.host') delete patch.host
    if (path === 'webui.port') delete patch.port
  }
  return patch
}

/** "由…指定，这里改不了" for a pinned field */
export function lockedBy(lock: EnvLock): string {
  return lock.by.startsWith('-') ? `由启动参数 ${lock.by} 指定，这里改不了` : `由环境变量 ${lock.by} 指定，这里改不了`
}
