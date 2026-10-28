import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { usePluginList } from '../../plugin-host/pluginList'
import { useSettingsPages } from '../../plugin-host/views'
import { ChevronLeft, ChevronRight, FolderSearch, Loader2, Puzzle, Search, X } from 'lucide-react'
import { showToast } from '../common'
import { PluginStatus } from '../../types/plugins'
import { addPluginInstance, reloadPlugin, scanPlugins, setPluginEnabled } from '../../utils/pluginApi'
import PluginCard from './PluginCard'
import { findConflicts } from './meta'
import {
  CATEGORIES, CategoryKey, filterPlugins, groupByCategory, pageNumbers, paginate, pluginCategory, sortPlugins,
  StatusFilter,
} from './listing'
import PluginConfigDialog from './PluginConfigDialog'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const PAGE_SIZE = 12
// Survives a trip to a settings page and back
const VIEW_KEY = 'llbot-plugins-view'

interface View {
  category: CategoryKey | 'all'
  status: StatusFilter
  search: string
  page: number
}

const DEFAULT_VIEW: View = { category: 'all', status: 'all', search: '', page: 1 }

function loadView(): View {
  try {
    return { ...DEFAULT_VIEW, ...JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? '{}') }
  } catch {
    return DEFAULT_VIEW
  }
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '未启用' },
  { value: 'attention', label: '需要处理' },
]

const tab = (active: boolean) => `px-3 py-1.5 rounded-full text-sm transition-colors ${
  active ? 'gradient-primary text-white' : 'bg-theme-item text-theme-secondary hover:text-theme hover:bg-theme-item-hover'
}`

const pageButton = (active: boolean) => `min-w-9 h-9 px-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${
  active ? 'gradient-primary text-white' : 'text-theme-secondary hover:text-theme hover:bg-theme-item'
}`

const PluginsPage: React.FC = () => {
  // Kept current by the plugin UI host, which follows the status stream for the whole WebUI
  const plugins = usePluginList(state => state.plugins)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [editing, setEditing] = useState<PluginStatus | null>(null)
  const [view, setView] = useState<View>(loadView)

  const refresh = useCallback(async () => {
    try {
      await usePluginList.getState().refresh()
    } catch (e) {
      showToast(`获取插件列表失败：${errorText(e)}`, 'error')
      usePluginList.setState(state => ({ plugins: state.plugins ?? [] }))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(view))
  }, [view])

  // A new filter starts over at the first page
  const update = (patch: Partial<View>) => setView(previous => ({ ...previous, page: 1, ...patch }))

  const sorted = useMemo(() => sortPlugins(plugins ?? []), [plugins])
  const matching = useMemo(() => filterPlugins(sorted, view), [sorted, view.status, view.search])
  const counts = useMemo(() => {
    const result = new Map<CategoryKey, number>()
    for (const plugin of matching) result.set(pluginCategory(plugin), (result.get(pluginCategory(plugin)) ?? 0) + 1)
    return result
  }, [matching])
  const shown = useMemo(
    () => (view.category === 'all' ? matching : matching.filter(plugin => pluginCategory(plugin) === view.category)),
    [matching, view.category],
  )
  const { items, page, pages } = paginate(shown, view.page, PAGE_SIZE)
  const conflicts = useMemo(() => findConflicts(plugins ?? []), [plugins])
  const settingsPages = useSettingsPages()
  const openSettings = (plugin: PluginStatus) => {
    const key = settingsPages.get(plugin.name)
    return key ? () => { window.location.hash = key } : undefined
  }
  const countByName = useMemo(() => {
    const result = new Map<string, number>()
    for (const plugin of plugins ?? []) if (!plugin.builtin) result.set(plugin.name, (result.get(plugin.name) ?? 0) + 1)
    return result
  }, [plugins])
  const filtered = view.status !== 'all' || !!view.search.trim() || view.category !== 'all'
  const current = CATEGORIES.find(category => category.key === view.category)

  const withBusy = async (id: string, task: () => Promise<void>) => {
    setBusy(previous => new Set(previous).add(id))
    try {
      await task()
    } catch (e) {
      showToast(errorText(e), 'error')
    } finally {
      setBusy(previous => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    }
  }

  const toggle = (plugin: PluginStatus, enabled: boolean) => withBusy(plugin.id, async () => {
    const status = await setPluginEnabled(plugin.id, enabled)
    if (enabled && status.state === 'failed') showToast(`启用后运行出错：${status.error ?? '未知错误'}`, 'error')
  })

  const reload = (plugin: PluginStatus) => withBusy(plugin.id, async () => {
    const result = await reloadPlugin(plugin.id)
    if (result.status === 'reloaded') showToast(plugin.builtin ? '已重启' : '已重新加载', 'success')
    else showToast(`需要重启 Bot 才能生效：${result.reason}`, 'warning')
  })

  const duplicate = (plugin: PluginStatus) => withBusy(plugin.id, async () => {
    await addPluginInstance(plugin.name)
    showToast('已添加新实例', 'success')
  })

  const scan = async () => {
    setScanning(true)
    try {
      const { added, removed } = await scanPlugins()
      const parts = [added.length && `新增 ${added.length} 个`, removed.length && `移除 ${removed.length} 个`].filter(Boolean)
      showToast(parts.length ? `扫描完成：${parts.join('，')}` : '扫描完成，没有变化', 'success')
      await refresh()
    } catch (e) {
      showToast(`扫描失败：${errorText(e)}`, 'error')
    } finally {
      setScanning(false)
    }
  }

  const card = (plugin: PluginStatus) => (
    <PluginCard
      key={plugin.id}
      plugin={plugin}
      instanceTag={(countByName.get(plugin.name) ?? 0) > 1 ? `#${plugin.id}` : undefined}
      conflicts={conflicts.get(plugin.id)}
      busy={busy.has(plugin.id)}
      onToggle={enabled => toggle(plugin, enabled)}
      // A plugin with a settings page is configured there; App follows the hash
      onConfigure={openSettings(plugin) ?? (plugin.builtin ? undefined : () => setEditing(plugin))}
      onReload={() => reload(plugin)}
      // Builtins run as a single instance
      onDuplicate={plugin.builtin ? undefined : () => duplicate(plugin)}
    />
  )

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center flex-shrink-0">
            <Puzzle size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-theme">插件</h3>
            <p className="text-sm text-theme-secondary">
              把插件目录放进 <code className="text-xs px-1.5 py-0.5 rounded bg-theme-item">data/plugins/</code> 后重新扫描，新插件默认不启用
            </p>
          </div>
          <button onClick={scan} disabled={scanning} className="btn-glass flex items-center gap-2 flex-shrink-0">
            {scanning ? <Loader2 size={18} className="animate-spin" /> : <FolderSearch size={18} />}
            重新扫描
          </button>
        </div>
      </div>

      {plugins === null && (
        <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
      )}

      {plugins !== null && (
        <>
          <div className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint pointer-events-none" />
                <input
                  value={view.search}
                  onChange={e => update({ search: e.target.value })}
                  placeholder="搜索插件名称或说明"
                  className="input-field pl-10 pr-10"
                />
                {view.search && (
                  <button type="button" onClick={() => update({ search: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme" title="清除">
                    <X size={18} />
                  </button>
                )}
              </div>
              <select value={view.status} onChange={e => update({ status: e.target.value as StatusFilter })} className="input-field w-36 flex-shrink-0">
                {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => update({ category: 'all' })} className={tab(view.category === 'all')}>
                全部 {matching.length}
              </button>
              {CATEGORIES.filter(category => counts.get(category.key) || view.category === category.key).map(category => (
                <button key={category.key} type="button" onClick={() => update({ category: category.key })} className={tab(view.category === category.key)} title={category.hint}>
                  {category.label} {counts.get(category.key) ?? 0}
                </button>
              ))}
            </div>
            {current && <p className="text-xs text-theme-muted px-1">{current.hint}</p>}
          </div>

          {shown.length === 0 ? (
            <div className="card p-10 text-center">
              <Puzzle size={40} className="mx-auto text-theme-hint mb-4" />
              <p className="text-theme font-medium">没有符合条件的插件</p>
              {filtered
                ? <button type="button" onClick={() => setView({ ...DEFAULT_VIEW })} className="btn-glass mt-6">清除筛选</button>
                : <p className="text-sm text-theme-secondary mt-2">一个插件就是一个带 llbot 字段的 npm 包目录，放进 data/plugins/ 后点"重新扫描"</p>}
            </div>
          ) : view.category === 'all' ? (
            groupByCategory(items).map(group => (
              <section key={`${group.category}-${group.plugins[0].id}`}>
                <h3 className="text-sm font-medium text-theme-secondary mb-3 px-1 flex items-baseline gap-2">
                  {CATEGORIES.find(category => category.key === group.category)!.label}
                  <span className="text-xs font-normal text-theme-muted">{CATEGORIES.find(category => category.key === group.category)!.hint}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{group.plugins.map(card)}</div>
              </section>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{items.map(card)}</div>
          )}

          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button type="button" onClick={() => setView({ ...view, page: page - 1 })} disabled={page <= 1} className={pageButton(false)} title="上一页">
                <ChevronLeft size={18} className="mx-auto" />
              </button>
              {pageNumbers(page, pages).map((number, index) => number === null
                ? <span key={`gap-${index}`} className="px-1 text-theme-muted">…</span>
                : (
                  <button key={number} type="button" onClick={() => setView({ ...view, page: number })} className={pageButton(number === page)}>
                    {number}
                  </button>
                ))}
              <button type="button" onClick={() => setView({ ...view, page: page + 1 })} disabled={page >= pages} className={pageButton(false)} title="下一页">
                <ChevronRight size={18} className="mx-auto" />
              </button>
              <span className="text-xs text-theme-muted ml-3">共 {shown.length} 个</span>
            </div>
          )}
        </>
      )}

      {editing && (
        <PluginConfigDialog
          plugin={editing}
          plugins={plugins ?? []}
          removable={(countByName.get(editing.name) ?? 0) > 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export default PluginsPage
