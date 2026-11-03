import Schema from 'schemastery'
import type { NTProtocolConfig } from '@/common/types'
import type { BuiltinConfig } from '../../../host'

// An entry is saved without what equals these defaults, so changing one changes every entry that left it out:
// installs from before the change get the old value written in (migrateToInstances in main/config/migrate.ts)
export const NTProtocolSchema: Schema<NTProtocolConfig> = Schema.object({
  mode: Schema.union([
    Schema.const('direct').description('纯协议'),
    Schema.const('nativeqq').description('官方 QQ 客户端桥接'),
  ]).default('nativeqq').description('登录方式'),
  protocol: Schema.union([
    Schema.const('linux').description('Linux'),
    Schema.const('macos').description('macOS'),
    Schema.const('windows').description('Windows'),
    Schema.const('watch').description('手表'),
  ]).default('macos').description('纯协议模拟的 QQ 客户端'),
  nativeQQ: Schema.object({
    qqPath: Schema.string().default('').description('QQ 可执行文件绝对路径（留空自动检测）'),
  }).description('官方 QQ 客户端桥接'),
}) as Schema<NTProtocolConfig>

export const ntProtocolSettings: BuiltinConfig<NTProtocolConfig> = {
  // Rebuilt so a configPath saved before the field went is dropped with the next save
  normalize: value => ({ ...value, nativeQQ: { qqPath: (value.nativeQQ.qqPath || '').trim() } }),
  check: () => [],
}
