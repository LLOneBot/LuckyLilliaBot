import Schema from 'schemastery'
import type { NTProtocolConfig } from '@/common/types'
import type { BuiltinConfig } from '../../plugin'

export const NTProtocolSchema: Schema<NTProtocolConfig> = Schema.object({
  mode: Schema.union([
    Schema.const('direct').description('纯协议'),
    Schema.const('pmhq').description('官方 QQ 端桥接'),
  ]).default('direct').description('登录方式'),
  protocol: Schema.union([
    Schema.const('linux').description('Linux'),
    Schema.const('macos').description('macOS'),
    Schema.const('windows').description('Windows'),
    Schema.const('watch').description('手表'),
  ]).default('linux').description('纯协议模拟的 QQ 客户端'),
  pmhq: Schema.object({
    host: Schema.string().default('127.0.0.1').description('PMHQ 地址'),
    port: Schema.natural().min(1).max(65535).default(13000).description('PMHQ 端口'),
  }).description('官方 QQ 端桥接连接的 PMHQ'),
}) as Schema<NTProtocolConfig>

export const ntProtocolSettings: BuiltinConfig<NTProtocolConfig> = {
  normalize: value => ({ ...value, pmhq: { ...value.pmhq, host: value.pmhq.host.trim() } }),
  check: value => value.mode === 'pmhq' && !value.pmhq.host ? [{ path: ['pmhq', 'host'], message: '请填写 PMHQ 地址' }] : [],
}
