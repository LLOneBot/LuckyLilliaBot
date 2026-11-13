import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { PluginDetailsSource, PluginsViewProps } from '@luckylillia/plugin-sdk/webui'
import { ArrowLeft, ChevronLeft, ChevronRight, FileUp, Loader2, Puzzle, RefreshCw, Search, X } from 'lucide-react'
import { usePluginList } from '../../plugin-host/pluginList'
import { SlotOutlet, useSettingsPages, useSlotContents } from '../../plugin-host/views'
import { PluginBoundary } from '../../plugin-host/context'
import { contributionKey, useRegistry } from '../../plugin-host/registry'
import { configurableSlots } from '../../plugin-host/slotLayout'
import { showToast } from '../common'
import type { PluginStatus } from '../../types/plugins'
import { getPluginDetails, reloadPlugin, scanPlugins, TrustRequiredError } from '../../utils/pluginApi'
import PluginCard from './PluginCard'
import { findConflicts, pluginDescription, pluginTitle } from './meta'
import { CATEGORIES, pageNumbers, paginate, type OriginFilter, type StatusFilter } from './listing'
import { usePluginCatalog } from './catalog'
import { filterPluginItems, isInstalled, itemCategory, itemName, mergePluginItems, type PluginFilters, type PluginListItem } from './unifiedListing'
import PluginConfigDialog from './PluginConfigDialog'
import PluginDetailsDialog from './PluginDetailsDialog'
import LocalInstallDialog from './LocalInstallDialog'
import TrustDialog from './TrustDialog'

const errorText = (e: unknown) => e instanceof Error ? e.message : String(e)
const PAGE_SIZE = 12
const VIEW_KEY = 'llbot-plugins-browser'
interface View extends PluginFilters { mode: string; page: number }
const DEFAULT_VIEW: View = { mode: 'list', installation: 'installed', category: 'all', status: 'all', origin: 'all', search: '', updatesOnly: false, page: 1 }
function loadView(): View {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? '{}')
    return { ...DEFAULT_VIEW, ...saved, mode: 'list', installation: 'installed', page: 1, updatesOnly: false }
  } catch { return DEFAULT_VIEW }
}
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' }, { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '未启用' }, { value: 'attention', label: '需要处理' },
]
const ORIGIN_OPTIONS: { value: OriginFilter; label: string }[] = [
  { value: 'all', label: '全部来源' }, { value: 'builtin', label: '内置插件' }, { value: 'third-party', label: '第三方插件' },
]
const filterChoice = (active: boolean) => `px-2.5 py-1.5 rounded-lg text-xs sm:text-sm whitespace-nowrap transition-colors ${active ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 font-medium' : 'text-theme-secondary hover:text-theme hover:bg-theme-item'}`
const pageButton = (active: boolean) => `min-w-9 h-9 px-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${active ? 'gradient-primary text-white' : 'text-theme-secondary hover:text-theme hover:bg-theme-item'}`

const PluginsPage: React.FC = () => {
  const plugins = usePluginList(state => state.plugins)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [listError, setListError] = useState('')
  const [installingLocal, setInstallingLocal] = useState(false)
  const [editing, setEditing] = useState<PluginStatus | null>(null)
  const [detailsOf, setDetailsOf] = useState<PluginDetailsSource | null>(null)
  const closeDetails = useCallback(() => setDetailsOf(null), [])
  const [trusting, setTrusting] = useState<{ plugin: PluginStatus; go: () => Promise<void> } | null>(null)
  const [view, setView] = useState<View>(loadView)
  const catalog = usePluginCatalog(view.installation !== 'installed')
  const refresh = useCallback(async () => {
    try {
      await usePluginList.getState().refresh()
      setListError('')
    } catch (e) { setListError(errorText(e)) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)) }, [view])
  const update = (patch: Partial<View>) => setView(previous => ({ ...previous, page: 1, ...patch }))

  const allItems = useMemo(() => mergePluginItems(plugins ?? [], catalog.sources), [plugins, catalog.sources])
  const matching = filterPluginItems(allItems, { ...view, category: 'all' })
  const shown = view.category === 'all' ? matching : matching.filter(item => itemCategory(item) === view.category)
  const counts = new Map(CATEGORIES.map(category => [category.key, matching.filter(item => itemCategory(item) === category.key).length]))
  const installationCounts = { installed: allItems.filter(isInstalled).length, uninstalled: allItems.filter(item => !isInstalled(item)).length, all: allItems.length }
  const catalogLoaded = catalog.sources.length > 0 && catalog.sources.every(source => source.state.items !== null)
  const catalogLoading = view.installation !== 'installed' && catalog.available && (!catalog.sources.length || catalog.sources.some(source => source.state.loading || (!source.state.items && !source.state.error)))
  const checking = catalog.sources.some(source => source.state.checking || source.state.loadingInstalled)
  const packageBusy = catalog.sources.some(source => source.state.busy.length > 0)
  const updateCount = new Set(allItems.filter(item => item.updateInfo?.update).map(itemName)).size
  const { items, page, pages } = paginate(shown, view.page, PAGE_SIZE)
  const conflicts = useMemo(() => findConflicts(plugins ?? []), [plugins])
  const settingsPages = useSettingsPages()
  const contributions = useRegistry(state => state.contributions)
  const countByName = useMemo(() => {
    const result = new Map<string, number>()
    for (const plugin of plugins ?? []) if (!plugin.builtin) result.set(plugin.name, (result.get(plugin.name) ?? 0) + 1)
    return result
  }, [plugins])
  const filtered = view.status !== 'all' || view.origin !== 'all' || !!view.search.trim() || view.category !== 'all' || view.updatesOnly
  const added = useSlotContents('plugins.views')
  const addedView = added.find(c => contributionKey(c) === view.mode)
  const mode = addedView ? view.mode : 'list'
  const titleOf = (c: (typeof added)[number]) => String(c.options.title ?? c.label ?? c.id)

  const withBusy = async (id: string, task: () => Promise<void>) => {
    setBusy(previous => new Set(previous).add(id))
    try { await task() } catch (e) { showToast(errorText(e), 'error') }
    finally { setBusy(previous => { const next = new Set(previous); next.delete(id); return next }) }
  }
  const trustFirst = (plugin: PluginStatus, run: (trust: boolean) => Promise<void>) => {
    const go = () => withBusy(plugin.id, () => run(true))
    if (!plugin.builtin && plugin.trusted === false) return setTrusting({ plugin, go })
    return withBusy(plugin.id, () => run(false).catch(e => {
      if (!(e instanceof TrustRequiredError)) throw e
      setTrusting({ plugin, go })
    }))
  }
  const toggle = (plugin: PluginStatus, enabled: boolean) => {
    const run = async (trust: boolean) => {
      const status = await usePluginList.getState().setEnabled(plugin.id, enabled, trust)
      if (enabled && status.state === 'failed') showToast(`启用后运行出错：${status.error ?? '未知错误'}`, 'error')
    }
    return enabled ? trustFirst(plugin, run) : withBusy(plugin.id, () => run(false))
  }
  const reload = (plugin: PluginStatus) => withBusy(plugin.id, async () => {
    const result = await reloadPlugin(plugin.id)
    if (result.status === 'reloaded') showToast(plugin.builtin ? '已重启' : '已重新加载', 'success')
    else showToast(`需要重启 Bot 才能生效：${result.reason}`, 'warning')
  })
  const scan = async () => {
    if (packageBusy || scanning) return
    setScanning(true)
    try {
      const { added, removed } = await scanPlugins()
      const parts = [added.length && `新增 ${added.length} 个`, removed.length && `移除 ${removed.length} 个`].filter(Boolean)
      showToast(parts.length ? `扫描完成：${parts.join('，')}` : '扫描完成，没有变化', 'success')
      await refresh()
      for (const source of catalog.sources) source.state.refresh()
      setInstallingLocal(false)
      update({ installation: 'installed', search: '', category: 'all', status: 'all', origin: 'all', updatesOnly: false })
    } catch (e) { showToast(`扫描失败：${errorText(e)}`, 'error') }
    finally { setScanning(false) }
  }
  const configure = (plugin: PluginStatus): { open?: () => void; label?: string } => {
    if (!plugin.builtin) return { open: () => setEditing(plugin), label: '配置' }
    const key = settingsPages.get(plugin.name)
    if (key) return { open: () => { window.location.hash = key }, label: '前往设置' }
    return plugin.hasConfig || configurableSlots(contributions, plugin.name).length ? { open: () => setEditing(plugin), label: '配置' } : {}
  }
  const configAction: PluginsViewProps['configAction'] = id => {
    const plugin = plugins?.find(plugin => plugin.id === id)
    if (!plugin || busy.has(id)) return undefined
    const action = configure(plugin)
    return action.open && action.label ? { open: action.open, label: action.label } : undefined
  }
  const packageAction = async (action: () => Promise<boolean>) => {
    if (scanning) return
    try { if (await action()) await refresh() }
    catch (e) { showToast(errorText(e), 'error') }
  }
  const card = (item: PluginListItem) => {
    const { plugin, source, packageStatus, catalog: entry, updateInfo } = item
    const gear = plugin ? configure(plugin) : {}
    const ready = !!source?.state.installed && !source.state.installedError
    const name = itemName(item)
    return <PluginCard key={item.key} plugin={plugin} catalog={entry} packageStatus={packageStatus} updateInfo={updateInfo}
      instanceTag={plugin && (countByName.get(plugin.name) ?? 0) > 1 ? `#${plugin.id}` : undefined}
      conflicts={plugin && conflicts.get(plugin.id)}
      busy={!!(plugin && busy.has(plugin.id)) || packageBusy || scanning}
      entryBusy={plugin && busy.has(plugin.id)}
      packageBusy={source?.state.busy.includes(name)}
      onToggle={plugin ? enabled => { void toggle(plugin, enabled) } : undefined}
      onConfigure={gear.open} configureLabel={gear.label}
      onReload={plugin ? () => { void reload(plugin) } : undefined}
      onInstall={(!isInstalled(item) || (plugin?.state === 'missing' && !packageStatus)) && entry && ready ? () => { void packageAction(() => source!.state.install(entry.name, entry.version)) } : undefined}
      onUpdate={packageStatus?.managed && updateInfo?.update && ready ? () => { void packageAction(() => source!.state.update(name)) } : undefined}
      onUninstall={packageStatus?.managed && !packageStatus.builtin && ready ? keepConfig => { void packageAction(() => source!.state.uninstall(name, { keepConfig })) } : undefined}
      onDetails={() => setDetailsOf(plugin ? {
        name: plugin.packageName ?? plugin.name, title: pluginTitle(plugin), version: plugin.version,
        description: pluginDescription(plugin) ?? entry?.description, author: plugin.author ?? entry?.author,
        icon: plugin.manifest.icon, iconUrl: plugin.iconUrl ?? entry?.iconUrl,
        screenshots: entry?.screenshots, load: plugin.hasDetails ? () => getPluginDetails(plugin.id) : undefined,
      } : entry ?? { name, title: packageStatus?.title ?? name, version: packageStatus?.version, description: packageStatus?.description })}
    />
  }
  const clearFilters = () => update({ ...DEFAULT_VIEW, installation: view.installation })

  return (
    <div className="space-y-5">
      {catalog.bridge}
      {mode === 'list' ? (
        <>
          <div className="card p-4 sm:p-5 space-y-1.5">
            <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="flex items-start gap-3" role="group" aria-label="插件安装状态">
                <span className="w-8 shrink-0 py-1.5 text-xs sm:text-sm text-theme-muted">安装</span>
                <div className="flex flex-wrap gap-1">{([['installed', '已安装'], ['uninstalled', '未安装'], ['all', '全部插件']] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={view.installation === value}
                    onClick={() => update({ installation: value, status: 'all', updatesOnly: false })} className={filterChoice(view.installation === value)}>
                    {label}{(value === 'installed' || catalogLoaded) && <span className="ml-1.5 text-xs opacity-60">{installationCounts[value]}</span>}
                  </button>
                ))}</div>
              </div>
              <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
                <SlotOutlet name="plugins.toolbar" />
                {catalog.available && <button type="button" onClick={() => catalog.sources.forEach(source => source.state.refresh())} disabled={checking || packageBusy || !catalog.sources.length}
                  title="检查更新" className="btn-glass inline-flex items-center gap-1.5 text-sm"><RefreshCw size={16} className={checking ? 'animate-spin' : ''} /><span className="hidden sm:inline">检查更新</span></button>}
                <button type="button" disabled={scanning || packageBusy} onClick={() => setInstallingLocal(true)} className="btn-primary inline-flex items-center gap-1.5 text-sm"><FileUp size={16} />本地安装</button>
                {added.map(c => <button key={contributionKey(c)} type="button" onClick={() => update({ mode: contributionKey(c) })} className="btn-glass text-sm">{titleOf(c)}</button>)}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-3" role="group" aria-label="插件来源">
                <span className="w-8 shrink-0 py-1.5 text-xs sm:text-sm text-theme-muted">来源</span>
                <div className="flex flex-wrap gap-1">{ORIGIN_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={view.origin === option.value} onClick={() => update({ origin: option.value })} className={filterChoice(view.origin === option.value)}>{option.value === 'all' ? '全部' : option.label}</button>)}</div>
              </div>
              {view.installation !== 'uninstalled' && <div className="flex items-start gap-3" role="group" aria-label="插件运行状态">
                <span className="w-8 shrink-0 py-1.5 text-xs sm:text-sm text-theme-muted">状态</span>
                <div className="flex flex-wrap gap-1">{STATUS_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={view.status === option.value} onClick={() => update({ status: option.value })} className={filterChoice(view.status === option.value)}>{option.value === 'all' ? '全部' : option.label}</button>)}</div>
              </div>}
              <div className="flex items-start gap-3" role="group" aria-label="插件分类">
                <span className="w-8 shrink-0 py-1.5 text-xs sm:text-sm text-theme-muted">分类</span>
                <div className="flex flex-wrap gap-1">
                  <button type="button" aria-pressed={view.category === 'all'} onClick={() => update({ category: 'all' })} className={filterChoice(view.category === 'all')}>全部 <span className="text-xs opacity-60">{matching.length}</span></button>
                  {CATEGORIES.filter(category => counts.get(category.key) || view.category === category.key).map(category => (
                    <button key={category.key} type="button" aria-pressed={view.category === category.key} onClick={() => update({ category: category.key })} className={filterChoice(view.category === category.key)} title={category.hint}>
                      {category.label} <span className="text-xs opacity-60">{counts.get(category.key) ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-theme-divider">
              <div className="relative min-w-0 basis-full sm:basis-48 flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint pointer-events-none" />
                <input value={view.search} onChange={e => update({ search: e.target.value })} placeholder="搜索名称、包名或作者" aria-label="搜索插件" className="input-field pl-10 pr-10" />
                {view.search && <button type="button" onClick={() => update({ search: '' })} title="清除搜索" className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme"><X size={16} /></button>}
              </div>
              {view.installation !== 'uninstalled' && catalog.available && <label className="inline-flex shrink-0 items-center gap-1.5 px-1 text-xs text-theme-secondary"><input type="checkbox" checked={view.updatesOnly} onChange={event => update({ updatesOnly: event.target.checked })} className="accent-pink-500" />只看可更新{updateCount > 0 && ` (${updateCount})`}</label>}
            </div>
          </div>
          {listError && <div role="alert" className="card p-4 flex items-center gap-3 text-sm"><p className="flex-1 text-red-500">加载已安装插件失败：{listError}</p><button type="button" onClick={() => void refresh()} className="btn-glass">重试</button></div>}
          {catalog.sources.map(({ key, state }) => {
            const errors = [state.installedError && `加载插件包失败：${state.installedError}`, state.updatesError && `检查更新失败：${state.updatesError}`, view.installation !== 'installed' && state.error && `加载市场目录失败：${state.error}`].filter(Boolean)
            return errors.length ? <div key={key} role="alert" className="card p-4 flex items-start gap-3 text-sm"><div className="flex-1 min-w-0 space-y-1 text-red-500 break-words">{errors.map((error, index) => <p key={index}>{error}</p>)}</div><button type="button" disabled={checking || packageBusy} onClick={() => { state.refresh(); if (view.installation !== 'installed') state.retry() }} className="btn-glass">重试</button></div> : null
          })}
          {view.installation !== 'installed' && !catalog.available && <div className="card p-5 text-sm text-theme-secondary">启用「插件市场」后可浏览未安装的插件。已安装插件仍可正常管理。</div>}
          {catalogLoading && <div className="flex items-center justify-center gap-2 py-4 text-sm text-theme-muted"><Loader2 size={18} className="animate-spin" />正在加载市场目录…</div>}
          {plugins === null && !listError ? <div className="flex justify-center py-12"><Loader2 size={32} className="animate-spin text-pink-500" /></div> : (
            <>
              {shown.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{items.map(card)}</div> : !catalogLoading && (view.installation === 'installed' || (catalogLoaded && !catalog.sources.some(source => source.state.error))) && (
                <div className="card p-10 text-center"><Puzzle size={36} className="mx-auto text-theme-hint mb-3" /><p className="text-sm text-theme-secondary">{view.updatesOnly ? '暂无可更新的插件' : filtered ? '没有符合条件的插件' : view.installation === 'uninstalled' ? '当前目录没有未安装的插件' : '暂无插件'}</p>
                  {filtered && <button type="button" onClick={clearFilters} className="btn-glass mt-4 text-sm">清除筛选</button>}
                </div>
              )}
              {pages > 1 && <div className="flex flex-wrap items-center justify-center gap-1">
                <button type="button" onClick={() => update({ page: page - 1 })} disabled={page <= 1} className={pageButton(false)} title="上一页"><ChevronLeft size={18} className="mx-auto" /></button>
                {pageNumbers(page, pages).map((number, index) => number === null ? <span key={`gap-${index}`} className="px-1 text-theme-muted">…</span> : <button key={number} type="button" onClick={() => update({ page: number })} className={pageButton(number === page)}>{number}</button>)}
                <button type="button" onClick={() => update({ page: page + 1 })} disabled={page >= pages} className={pageButton(false)} title="下一页"><ChevronRight size={18} className="mx-auto" /></button>
                <span className="text-xs text-theme-muted ml-3">共 {shown.length} 个</span>
              </div>}
            </>
          )}
        </>
      ) : addedView && (
        <>
          <div className="flex items-center gap-3"><button type="button" onClick={() => update({ mode: 'list' })} className="btn-glass inline-flex items-center gap-1.5 text-sm"><ArrowLeft size={16} />返回插件</button><h3 className="font-medium text-theme">{titleOf(addedView)}</h3></div>
          <PluginBoundary key={contributionKey(addedView)} owner={addedView.owner} failure={{ key: contributionKey(addedView), where: `插件页的「${titleOf(addedView)}」` }}><addedView.component configAction={configAction} showDetails={setDetailsOf} /></PluginBoundary>
        </>
      )}
      {installingLocal && <LocalInstallDialog scanning={scanning} busy={packageBusy} onScan={scan} onClose={() => setInstallingLocal(false)} onInstalled={() => { setInstallingLocal(false); update({ installation: 'installed', search: '', category: 'all', status: 'all', origin: 'all', updatesOnly: false }); void refresh() }} />}
      {trusting && <TrustDialog plugin={trusting.plugin} onCancel={() => setTrusting(null)} onConfirm={() => { setTrusting(null); void trusting.go() }} />}
      {detailsOf && <PluginDetailsDialog source={detailsOf} onClose={closeDetails} />}
      {editing && <PluginConfigDialog plugin={editing} plugins={plugins ?? []} removable={(countByName.get(editing.name) ?? 0) > 1} onClose={() => setEditing(null)} />}
    </div>
  )
}

export default PluginsPage
