import Schema from 'schemastery'
import type { SatoriConfig } from '@/common/types'
import type { BuiltinConfig } from '../../../host'
import { satoriIssues } from '../../../../main/config/validate'
import { fromTemplate } from '../settingsTemplate'

export type SatoriSettings = Omit<SatoriConfig, 'enable'>

// Defaults mirror defaultConfig.ts (a test pins them)
export const SatoriSchema: Schema<SatoriSettings> = Schema.object({
  host: Schema.string().role('host').default('127.0.0.1').description('监听地址（留空 = 监听全部地址）'),
  port: Schema.natural().min(1).max(65535).default(5600).description('Satori 端口'),
  token: Schema.string().role('secret').default('').description('Satori Token：用于 Satori 连接验证'),
}) as Schema<SatoriSettings>

export const satoriSettings: BuiltinConfig<SatoriSettings> = {
  check: satoriIssues,
  // The token rule guards a public listener: switching on must not bypass it
  checkOnEnable: true,
  initial: () => fromTemplate('satori'),
}
