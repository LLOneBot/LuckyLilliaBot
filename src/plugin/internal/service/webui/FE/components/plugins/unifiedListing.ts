import type { PluginCatalogItem, PluginInstalledPackage, PluginUpdateInfo } from '@luckylillia/plugin-sdk/webui'
import type { PluginStatus } from '../../types/plugins'
import type { CatalogSource } from './catalog'
import { CATEGORIES, needsAttention, type CategoryKey, type OriginFilter, type StatusFilter } from './listing'
import { pluginDescription, pluginTitle } from './meta'

export type InstallationFilter = 'installed' | 'uninstalled' | 'all'
export interface PluginListItem {
  key: string
  plugin?: PluginStatus
  catalog?: PluginCatalogItem
  packageStatus?: PluginInstalledPackage
  updateInfo?: PluginUpdateInfo
  source?: CatalogSource
}

export const isInstalled = (item: PluginListItem) => !!(item.plugin || item.packageStatus)
export const itemName = (item: PluginListItem) => item.packageStatus?.name ?? item.plugin?.packageName ?? item.catalog?.name ?? item.plugin!.name
export const itemTitle = (item: PluginListItem) => item.plugin ? pluginTitle(item.plugin) : item.packageStatus?.title ?? item.catalog?.title ?? itemName(item)
export const itemBuiltin = (item: PluginListItem) => !!(item.plugin?.builtin || item.packageStatus?.builtin || item.catalog?.builtin)
export const itemCategory = (item: PluginListItem): CategoryKey => {
  const value = item.plugin?.manifest.category ?? item.catalog?.category
  return CATEGORIES.find(category => category.key === value)?.key ?? 'other'
}

/** Retain local and multi-instance entries; append only catalog packages not already installed. */
export function mergePluginItems(plugins: PluginStatus[], sources: CatalogSource[]): PluginListItem[] {
  const catalog = new Map<string, { entry: PluginCatalogItem; source: CatalogSource }>()
  const packages = new Map<string, { pkg: PluginInstalledPackage; source: CatalogSource }>()
  for (const source of sources) {
    for (const entry of source.state.items ?? []) if (!catalog.has(entry.name)) catalog.set(entry.name, { entry, source })
    for (const pkg of source.state.installed ?? []) if (!packages.has(pkg.name)) packages.set(pkg.name, { pkg, source })
  }
  const seen = new Set<string>()
  const items: PluginListItem[] = plugins.map(plugin => {
    const name = plugin.packageName ?? [...packages.values()].find(({ pkg }) => pkg.builtin === plugin.name)?.pkg.name ?? plugin.name
    const known = catalog.get(name) ?? [...catalog.values()].find(({ entry }) => entry.builtin === plugin.name)
    const installed = packages.get(name)
    seen.add(name)
    if (known) seen.add(known.entry.name)
    const source = installed?.source ?? known?.source
    return { key: `entry:${plugin.id}`, plugin, catalog: known?.entry, packageStatus: installed?.pkg, source, updateInfo: source?.state.updates?.[name] }
  })
  for (const [name, { pkg, source }] of packages) {
    if (seen.has(name)) continue
    seen.add(name)
    items.push({ key: `package:${name}`, packageStatus: pkg, catalog: catalog.get(name)?.entry, source, updateInfo: source.state.updates?.[name] })
  }
  for (const [name, { entry, source }] of catalog) {
    if (!seen.has(name)) items.push({ key: `catalog:${name}`, catalog: entry, source })
  }
  const rank = (item: PluginListItem) => CATEGORIES.findIndex(category => category.key === itemCategory(item))
  return items.sort((a, b) => rank(a) - rank(b) || Number(itemBuiltin(b)) - Number(itemBuiltin(a))
    || Number(isInstalled(b)) - Number(isInstalled(a)) || itemName(a).localeCompare(itemName(b)) || a.key.localeCompare(b.key))
}

export interface PluginFilters {
  installation: InstallationFilter
  category: CategoryKey | 'all'
  status: StatusFilter
  origin: OriginFilter
  search: string
  updatesOnly: boolean
}

export function filterPluginItems(items: PluginListItem[], filters: PluginFilters): PluginListItem[] {
  const query = filters.search.trim().toLocaleLowerCase()
  return items.filter(item => {
    if (filters.installation !== 'all' && isInstalled(item) !== (filters.installation === 'installed')) return false
    if (filters.category !== 'all' && itemCategory(item) !== filters.category) return false
    if (filters.origin === 'builtin' && !itemBuiltin(item)) return false
    if (filters.origin === 'third-party' && itemBuiltin(item)) return false
    if (filters.status === 'enabled' && (!item.plugin || item.plugin.disabled)) return false
    if (filters.status === 'disabled' && (!isInstalled(item) || (item.plugin && !item.plugin.disabled))) return false
    if (filters.status === 'attention' && !(item.plugin && needsAttention(item.plugin)) && !item.packageStatus?.error) return false
    if (filters.updatesOnly && !item.updateInfo?.update) return false
    if (query && ![itemTitle(item), itemName(item), item.plugin?.name,
      item.plugin ? pluginDescription(item.plugin) : item.catalog?.description ?? item.packageStatus?.description,
      item.plugin?.author?.name ?? item.catalog?.author?.name,
    ].some(value => value?.toLocaleLowerCase().includes(query))) return false
    return true
  })
}
