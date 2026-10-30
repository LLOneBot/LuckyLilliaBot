import Schema from 'schemastery'
import type { NTProtocolConfig } from '@/common/types'
import type { BuiltinConfig } from '../../../host'

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
    configPath: Schema.string().default('').description('PMHQ 配置文件绝对路径（可选）'),
    qqPath: Schema.string().default('').description('QQ 可执行文件绝对路径（留空自动检测）'),
  }).description('进程内 PMHQ 配置'),
}) as Schema<NTProtocolConfig>

export const ntProtocolSettings: BuiltinConfig<NTProtocolConfig> = {
  normalize: value => ({ ...value, pmhq: {
    configPath: (value.pmhq.configPath || '').trim(),
    qqPath: (value.pmhq.qqPath || '').trim(),
  } }),
  check: () => [],
}
