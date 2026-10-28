import { PluginStatus } from '../../types/plugins'
import { pluginDescription, pluginTitle } from './meta'

export type CategoryKey = 'protocol' | 'adapter' | 'chat' | 'tool' | 'service' | 'other'

/** The categories of the plugin page, in order; `llbot.category` names one (plugin-sdk's PluginCategory). */
export const CATEGORIES: { key: CategoryKey; label: string; hint: string }[] = [
  { key: 'protocol', label: '协议端', hint: '登录账号、把平台连进来，其他插件都通过它们收发消息' },
  { key: 'adapter', label: '适配器', hint: '让 Koishi、NoneBot 等框架通过 OneBot、Satori、Milky 等协议接入' },
  { key: 'chat', label: '消息互动', hint: '收到消息后做出回应：自动回复、复读、小游戏' },
  { key: 'tool', label: '工具', hint: '为自己启用的功能：WebQQ、通知、黑名单' },
  { key: 'service', label: '依赖组件', hint: '给其他插件提供服务，按需启用' },
  { key: 'other', label: '其他', hint: '不属于以上分类的，以及没写分类的插件' },
]

const RANK = new Map(CATEGORIES.map((category, index) => [category.key, index]))

/** Anything but a known category, nothing included, is `other`. */
export function pluginCategory(plugin: PluginStatus): CategoryKey {
  const category = plugin.manifest.category as CategoryKey | undefined
  return category && RANK.has(category) ? category : 'other'
}

export type StatusFilter = 'all' | 'enabled' | 'disabled' | 'attention'

/** What needs a look: files or versions that do not fit, a failed start, an enabled plugin still waiting. */
export function needsAttention(plugin: PluginStatus): boolean {
  if (plugin.state === 'missing' || plugin.state === 'incompatible' || plugin.state === 'failed') return true
  return !plugin.disabled && (plugin.state === 'pending' || !!plugin.notice)
}

/** Category order; within one, builtins in the bot's own order, then the rest by name and entry. */
export function sortPlugins(plugins: PluginStatus[]): PluginStatus[] {
  return plugins
    .map((plugin, index) => ({ plugin, index, rank: RANK.get(pluginCategory(plugin))! }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      if (!!a.plugin.builtin !== !!b.plugin.builtin) return a.plugin.builtin ? -1 : 1
      if (a.plugin.builtin) return a.index - b.index
      return a.plugin.name.localeCompare(b.plugin.name) || a.plugin.id.localeCompare(b.plugin.id)
    })
    .map(({ plugin }) => plugin)
}

export interface ListingQuery {
  status: StatusFilter
  /** Matched against the title, the package name and the description */
  search: string
}

/** Everything but the category: what the category tabs count. */
export function filterPlugins(plugins: PluginStatus[], query: ListingQuery): PluginStatus[] {
  const words = query.search.trim().toLowerCase()
  return plugins.filter((plugin) => {
    if (query.status === 'enabled' && plugin.disabled) return false
    if (query.status === 'disabled' && !plugin.disabled) return false
    if (query.status === 'attention' && !needsAttention(plugin)) return false
    if (!words) return true
    return [pluginTitle(plugin), plugin.name, pluginDescription(plugin) ?? ''].some(text => text.toLowerCase().includes(words))
  })
}

export function paginate<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pages)
  return { items: items.slice((current - 1) * size, current * size), page: current, pages }
}

/** Runs of one category in an already sorted list, for the section headers. */
export function groupByCategory(plugins: PluginStatus[]): { category: CategoryKey; plugins: PluginStatus[] }[] {
  const groups: { category: CategoryKey; plugins: PluginStatus[] }[] = []
  for (const plugin of plugins) {
    const category = pluginCategory(plugin)
    const last = groups[groups.length - 1]
    if (last?.category === category) last.plugins.push(plugin)
    else groups.push({ category, plugins: [plugin] })
  }
  return groups
}

/** Page numbers to show, with null for a gap: every page up to 7, else the ends and the neighbours of the current. */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter(number => number >= 1 && number <= pages))
  const sorted = [...wanted].sort((a, b) => a - b)
  const result: (number | null)[] = []
  for (const number of sorted) {
    const previous = result[result.length - 1]
    if (typeof previous === 'number' && number - previous > 1) result.push(null)
    result.push(number)
  }
  return result
}
