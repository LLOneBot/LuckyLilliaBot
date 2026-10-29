import type { QQOfficialConfig } from '@/common/types'
import type { BuiltinConfig, ConfigIssue } from '../../../host'

const missing = (value: QQOfficialConfig) => !value.appId?.trim() || !value.secret

// No checkOnEnable, and no failing at start either: switched on unfilled, the plugin waits and its card says
// what is missing; saving the settings while it is on is where they are checked
export const qqOfficialSettings: BuiltinConfig<QQOfficialConfig> = {
  check(value, enabled) {
    if (!enabled) return []
    const issues: ConfigIssue[] = []
    if (!value.appId.trim()) issues.push({ path: ['appId'], message: '请填写 AppID' })
    if (!value.secret) issues.push({ path: ['secret'], message: '请填写 AppSecret' })
    return issues
  },
  notice: value => missing(value) ? '还没有填写 AppID 和 AppSecret' : undefined,
  secrets: ['secret'],
  initial: () => ({ enabled: false }),
}
