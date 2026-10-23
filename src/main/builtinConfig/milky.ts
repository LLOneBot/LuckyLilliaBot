import Schema from 'schemastery'
import type { MilkyConfig } from '@/common/types'
import { milkyIssues } from '../config/validate'
import { botConfigBinding } from './botConfig'

// Defaults mirror defaultConfig.ts (a test pins them)
export const MilkySchema: Schema<MilkyConfig> = Schema.object({
  enable: Schema.boolean().default(false).description('启用 Milky 协议'),
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
}) as Schema<MilkyConfig>

export const milkyBinding = botConfigBinding('milky', {
  schema: MilkySchema,
  check: milkyIssues,
  // The form leaves a blank row behind when a URL is added and not filled in
  normalize: milky => ({ ...milky, webhook: { ...milky.webhook, urls: milky.webhook.urls.filter(url => url.trim()) } }),
})
