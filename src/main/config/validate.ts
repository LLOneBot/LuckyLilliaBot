import { Config, MilkyConfig, OB11Config, SatoriConfig } from '@/common/types'

// Kept out of ./index (the service) so tests that mock '@/main/config' still get the real rules.

function listensOnAllInterfaces(host: string | undefined): boolean {
  return !host || host === '0.0.0.0' || host === '::'
}

export function validateSatori(satori: Partial<SatoriConfig> | undefined): string | null {
  if (satori?.enable && listensOnAllInterfaces(satori.host) && !satori.token) {
    return 'Satori 监听全部地址时必须设置 Token'
  }
  return null
}

export function validateMilky(milky: Partial<MilkyConfig> | undefined): string | null {
  if (milky?.enable && listensOnAllInterfaces(milky.http?.host) && !milky.http?.accessToken) {
    return 'Milky HTTP 监听全部地址时必须设置 Token'
  }
  return null
}

export function validateOb11(ob11: Partial<OB11Config> | undefined): string | null {
  if (!ob11?.enable || !Array.isArray(ob11.connect)) return null
  for (const conn of ob11.connect) {
    if (!conn.enable) continue
    if ((conn.type === 'ws' || conn.type === 'http') && listensOnAllInterfaces(conn.host) && !conn.token) {
      return `OneBot11 ${conn.type === 'ws' ? 'WebSocket' : 'HTTP'} 适配器监听全部地址时必须设置 Token`
    }
  }
  return null
}

const SECTION_RULES: Record<string, (config: Config) => string | null> = {
  satori: config => validateSatori(config.satori),
  milky: config => validateMilky(config.milky),
  ob11: config => validateOb11(config.ob11),
}

/**
 * 校验一份完整的生效配置。只查 `sections` 里列出的片段 (不传就全查): 保存"其他配置"时,
 * 不该因为磁盘上已有的 Satori 坏配置 (比如经 set_config 或手改写进去的) 被拒。
 */
export function validateConfig(config: Config, sections: string[] = Object.keys(SECTION_RULES)): string | null {
  for (const section of sections) {
    const error = SECTION_RULES[section]?.(config)
    if (error) return error
  }
  return null
}
