import Schema from 'schemastery'
import type { BuiltinConfig } from '../../../host'

export interface MarketSettings {
  registry: string
  search: string
}

export const MarketSchema: Schema<MarketSettings> = Schema.object({
  registry: Schema.string().role('link').default('https://registry.npmmirror.com')
    .description('下载插件和它的依赖用的 npm 源，比如 https://registry.npmmirror.com（国内快）或 https://registry.npmjs.org（npm 官方）'),
  // npmmirror answers keyword searches with nothing
  search: Schema.string().role('link').default('https://registry.npmjs.org')
    .description('搜索插件用的 npm 源。npmmirror 不支持按关键词搜索，一般不用改'),
})

export const marketSettings: BuiltinConfig<MarketSettings> = {
  normalize: value => ({ ...value, registry: value.registry?.trim(), search: value.search?.trim() }),
  check(value) {
    return (['registry', 'search'] as const).flatMap((key) => {
      if (/^https?:\/\/[^/\s]+/.test(value[key] ?? '')) return []
      return [{ path: [key], message: '要填 http:// 或 https:// 开头的地址' }]
    })
  },
}
