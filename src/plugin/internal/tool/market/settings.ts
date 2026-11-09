import Schema from 'schemastery'
import type { BuiltinConfig } from '../../../host'
import { MARKET_PACKAGE } from './catalog'
import { isPackageName } from './registry'

export interface MarketSettings {
  registry: string
  catalog: string
}

export const MarketSchema: Schema<MarketSettings> = Schema.object({
  registry: Schema.string().role('link').default('https://registry.npmmirror.com')
    .description('读取插件目录、下载插件和依赖用的 npm 源，比如 https://registry.npmmirror.com 或 https://registry.npmjs.org'),
  catalog: Schema.string().default(MARKET_PACKAGE)
    .description('提供插件列表和已审核版本的 npm 目录包，不清楚时保持默认即可'),
})

export const marketSettings: BuiltinConfig<MarketSettings> = {
  normalize: value => ({ registry: value.registry?.trim(), catalog: value.catalog?.trim() }),
  check(value) {
    const issues: { path: string[]; message: string }[] = []
    try {
      const url = new URL(value.registry)
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) throw new Error()
    } catch {
      issues.push({ path: ['registry'], message: '要填 http:// 或 https:// 开头的有效地址' })
    }
    if (!isPackageName(value.catalog)) issues.push({ path: ['catalog'], message: '要填有效的 npm 包名，不能包含版本、URL 或文件路径' })
    return issues
  },
}
