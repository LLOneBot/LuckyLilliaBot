import Schema from 'schemastery'
import type { MilkyConfig } from '@/common/types'
import type { BuiltinConfig } from '../../plugin'
import { milkyIssues } from '../config/validate'
import { fromTemplate } from './template'

export type MilkySettings = Omit<MilkyConfig, 'enable'>

// Defaults mirror defaultConfig.ts (a test pins them)
export const MilkySchema: Schema<MilkySettings> = Schema.object({
  reportSelfMessage: Schema.boolean().default(false).description('上报自己发送的消息'),
  http: Schema.object({
    host: Schema.string().default('127.0.0.1').description('监听地址（留空 = 监听全部地址）'),
    port: Schema.natural().min(1).max(65535).default(3010).description('HTTP 端口'),
    prefix: Schema.string().default('').description('路径前缀：HTTP API 路径前缀（可选）'),
    accessToken: Schema.string().role('secret').default('').description('Access Token：用于 Milky HTTP 连接验证'),
  }).description('HTTP 配置'),
  webhook: Schema.object({
    urls: Schema.array(Schema.string().pattern(/^https?:\/\//)).default([]).description('Webhook URLs：事件上报的地址'),
    accessToken: Schema.string().role('secret').default('').description('Access Token：用于 Webhook 请求验证'),
  }).description('Webhook 配置'),
}) as Schema<MilkySettings>

export const milkySettings: BuiltinConfig<MilkySettings> = {
  check: milkyIssues,
  // The token rule guards a public listener: switching on must not bypass it
  checkOnEnable: true,
  // The form leaves a blank row behind when a URL is added and not filled in
  normalize: milky => ({ ...milky, webhook: { ...milky.webhook, urls: milky.webhook.urls.filter(url => url.trim()) } }),
  initial: () => fromTemplate('milky'),
}
