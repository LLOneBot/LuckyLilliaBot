import Schema from 'schemastery'
import type { SatoriConfig } from '@/common/types'
import { satoriIssues } from '../config/validate'
import { botConfigBinding } from './botConfig'

// Defaults mirror defaultConfig.ts (a test pins them)
export const SatoriSchema: Schema<SatoriConfig> = Schema.object({
  enable: Schema.boolean().default(false).description('启用 Satori 协议'),
  host: Schema.string().default('127.0.0.1').description('监听地址（留空 = 监听全部地址）'),
  port: Schema.natural().min(1).max(65535).default(5600).description('Satori 端口'),
  token: Schema.string().role('secret').default('').description('Satori Token：用于 Satori 连接验证'),
}) as Schema<SatoriConfig>

export const satoriBinding = botConfigBinding('satori', { schema: SatoriSchema, check: satoriIssues })
