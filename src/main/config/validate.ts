import { Config, MilkyConfig, OB11Config, SatoriConfig } from '@/common/types'

// Kept out of ./index (the service) so tests that mock '@/main/config' still get the real rules.

export interface SectionIssue {
  /** Relative to the section, e.g. ['token'] for satori.token. */
  path: string[]
  message: string
}

function listensOnAllInterfaces(host: string | undefined): boolean {
  return !host || host === '0.0.0.0' || host === '::'
}

export function satoriIssues(satori: Partial<SatoriConfig> | undefined): SectionIssue[] {
  if (satori?.enable && listensOnAllInterfaces(satori.host) && !satori.token) {
    return [{ path: ['token'], message: 'Satori 监听全部地址时必须设置 Token' }]
  }
  return []
}

export function milkyIssues(milky: Partial<MilkyConfig> | undefined): SectionIssue[] {
  if (milky?.enable && listensOnAllInterfaces(milky.http?.host) && !milky.http?.accessToken) {
    return [{ path: ['http', 'accessToken'], message: 'Milky HTTP 监听全部地址时必须设置 Token' }]
  }
  return []
}

export function ob11Issues(ob11: Partial<OB11Config> | undefined): SectionIssue[] {
  if (!ob11?.enable || !Array.isArray(ob11.connect)) return []
  const issues: SectionIssue[] = []
  ob11.connect.forEach((conn, index) => {
    if (!conn.enable) return
    if ((conn.type === 'ws' || conn.type === 'http') && listensOnAllInterfaces(conn.host) && !conn.token) {
      issues.push({
        path: ['connect', String(index), 'token'],
        message: `OneBot11 ${conn.type === 'ws' ? 'WebSocket' : 'HTTP'} 适配器监听全部地址时必须设置 Token`,
      })
    }
  })
  return issues
}

const SECTION_RULES: Record<string, (config: Config) => SectionIssue[]> = {
  satori: config => satoriIssues(config.satori),
  milky: config => milkyIssues(config.milky),
  ob11: config => ob11Issues(config.ob11),
}

/**
 * The first problem with a full effective config, or null. Only `sections` are checked (all when left
 * out): saving the other-settings page must not fail on a bad Satori section already on disk, e.g. one
 * written through set_config or by hand.
 */
export function validateConfig(config: Config, sections: string[] = Object.keys(SECTION_RULES)): string | null {
  for (const section of sections) {
    const issue = SECTION_RULES[section]?.(config)[0]
    if (issue) return issue.message
  }
  return null
}
