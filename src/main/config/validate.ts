import { MilkyConfig, OB11Config, SatoriConfig } from '@/common/types'

// Kept out of ./index (the service) so tests that mock '@/main/config' still get the real rules.

export interface SectionIssue {
  /** Relative to the section, e.g. ['token'] for satori.token. */
  path: string[]
  message: string
}

function listensOnAllInterfaces(host: string | undefined): boolean {
  return !host || host === '0.0.0.0' || host === '::'
}

// `enabled`: whether the adapter runs, or is being switched on. A switched-off one may hold anything.

export function satoriIssues(satori: Partial<SatoriConfig> | undefined, enabled: boolean): SectionIssue[] {
  if (enabled && listensOnAllInterfaces(satori?.host) && !satori?.token) {
    return [{ path: ['token'], message: 'Satori 监听全部地址时必须设置 Token' }]
  }
  return []
}

export function milkyIssues(milky: Partial<MilkyConfig> | undefined, enabled: boolean): SectionIssue[] {
  if (enabled && listensOnAllInterfaces(milky?.http?.host) && !milky?.http?.accessToken) {
    return [{ path: ['http', 'accessToken'], message: 'Milky HTTP 监听全部地址时必须设置 Token' }]
  }
  return []
}

export function ob11Issues(ob11: Partial<OB11Config> | undefined, enabled: boolean): SectionIssue[] {
  if (!enabled || !Array.isArray(ob11?.connect)) return []
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
