import React, { useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, ArrowUpCircle, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, PackageCheck, RefreshCw, Search,
  Trash2,
} from 'lucide-react'
import {
  usePluginContext, usePlugins, type PluginEntryStatus, type WebUIContext, type WebUIPlugin,
} from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:market'

// What /api/market answers (src/plugin/internal/tool/market/index.ts)
interface SearchItem {
  name: string
  version: string
  description?: string
  date?: string
  author?: string
  publisher?: string
  links?: { npm?: string; homepage?: string; repository?: string }
  installed?: string
}

interface InstalledPackage {
  name: string
  version: string
  description?: string
  managed: boolean
  root: string
}

interface UpdateInfo {
  latest?: string
  update?: string
  blocked?: string
  deprecated?: string
  error?: string
}

interface InstallOutcome {
  name: string
  version: string
  previous?: string
  entries: string[]
  scripts: string[]
  skipped: string[]
  reload?: { status: 'reloaded' } | { status: 'restart-required' | 'failed'; reason: string }
}

const PAGE_SIZE = 20
const UPDATE_CHECK_INTERVAL = 10 * 60_000

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const titleOf = (name: string) => name.replace(/^(@[^/]+\/)?luckylillia-plugin-/, '')

// One copy of the installed packages and their updates for the view, its tab's count and the cards
const store = {
  ctx: undefined as WebUIContext | undefined,
  installed: null as InstalledPackage[] | null,
  updates: null as Record<string, UpdateInfo> | null,
  checking: false,
  checkedAt: 0,
  /** Packages being installed or removed */
  busy: new Set<string>(),
  listeners: new Set<() => void>(),
  version: 0,
}

function emit() {
  store.version++
  for (const listener of store.listeners) listener()
}

async function loadInstalled() {
  try {
    store.installed = await store.ctx!.api<InstalledPackage[]>('/api/market/installed')
  } catch {
    store.installed ??= []
  }
  emit()
}

async function checkUpdates(force = false) {
  if (store.checking || (!force && Date.now() - store.checkedAt < UPDATE_CHECK_INTERVAL)) return
  store.checking = true
  emit()
  try {
    store.updates = await store.ctx!.api<Record<string, UpdateInfo>>('/api/market/updates')
    store.checkedAt = Date.now()
  } catch (e) {
    if (force) store.ctx!.toast(`检查更新失败：${errorText(e)}`, 'error')
  } finally {
    store.checking = false
    emit()
  }
}

function subscribe(listener: () => void) {
  store.listeners.add(listener)
  if (store.listeners.size === 1) {
    loadInstalled()
    checkUpdates()
  }
  return () => {
    store.listeners.delete(listener)
  }
}

function useMarket() {
  useSyncExternalStore(subscribe, () => store.version)
  return store
}

async function install(name: string): Promise<boolean> {
  const ctx = store.ctx!
  store.busy.add(name)
  emit()
  try {
    const outcome = await ctx.api<InstallOutcome>('/api/market/install', { body: { name } })
    const what = outcome.previous
      ? `已把 ${titleOf(name)} 从 ${outcome.previous} 更新到 ${outcome.version}`
      : `已安装 ${titleOf(name)} ${outcome.version}，到「插件」页启用它`
    const reload = outcome.reload
    if (reload?.status === 'restart-required') ctx.toast(`${what}，重启 Bot 后生效：${reload.reason}`, 'warning')
    else if (reload?.status === 'failed') ctx.toast(`${what}，但重新加载失败，还在跑旧版本：${reload.reason}`, 'error')
    else ctx.toast(what)
    if (outcome.scripts.length) {
      ctx.toast(`这些依赖带安装脚本，没有运行：${outcome.scripts.join('、')}。需要编译的原生模块会加载失败`, 'warning')
    }
    if (store.updates) delete store.updates[name]
    return true
  } catch (e) {
    ctx.toast(`安装 ${titleOf(name)} 失败：${errorText(e)}`, 'error')
    return false
  } finally {
    store.busy.delete(name)
    await loadInstalled()
  }
}

async function uninstall(name: string) {
  const ctx = store.ctx!
  store.busy.add(name)
  emit()
  try {
    await ctx.api('/api/market/uninstall', { body: { name } })
    ctx.toast(`已卸载 ${titleOf(name)}`)
    if (store.updates) delete store.updates[name]
  } catch (e) {
    ctx.toast(`卸载 ${titleOf(name)} 失败：${errorText(e)}`, 'error')
  } finally {
    store.busy.delete(name)
    await loadInstalled()
  }
}

const tab = (active: boolean) => `px-3 py-1.5 rounded-full text-sm transition-colors ${
  active ? 'gradient-primary text-white' : 'bg-theme-item text-theme-secondary hover:text-theme hover:bg-theme-item-hover'
}`

const InstallButton: React.FC<{ item: SearchItem }> = ({ item }) => {
  const market = useMarket()
  const installed = market.installed ? market.installed.find(pkg => pkg.name === item.name)?.version : item.installed
  if (market.busy.has(item.name)) {
    return <button type="button" disabled className="btn-glass flex items-center gap-1.5 text-sm"><Loader2 size={16} className="animate-spin" />请稍候</button>
  }
  if (installed === item.version) {
    return <span className="flex items-center gap-1.5 text-sm text-theme-muted px-2 py-1.5"><PackageCheck size={16} />已安装</span>
  }
  return (
    <button type="button" onClick={() => install(item.name)} className="btn-primary flex items-center gap-1.5 text-sm" title={installed ? `已装 ${installed}` : undefined}>
      {installed ? <ArrowUpCircle size={16} /> : <Download size={16} />}
      {installed ? '更新' : '安装'}
    </button>
  )
}

const ResultCard: React.FC<{ item: SearchItem }> = ({ item }) => (
  <div className="card p-4 flex flex-col gap-2">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-theme truncate">{titleOf(item.name)}</div>
        <div className="text-xs text-theme-muted font-mono truncate">{item.name} · {item.version}</div>
      </div>
      <InstallButton item={item} />
    </div>
    {item.description && <p className="text-sm text-theme-secondary line-clamp-2">{item.description}</p>}
    <div className="flex flex-wrap items-center gap-3 text-xs text-theme-muted">
      {(item.author || item.publisher) && <span title={item.author ? '作者' : '发布者'}>{item.author ?? item.publisher}</span>}
      {item.date && <span>{new Date(item.date).toLocaleDateString()}</span>}
      {item.links?.npm && <a href={item.links.npm} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-pink-500">npm<ExternalLink size={11} /></a>}
      {item.links?.homepage && <a href={item.links.homepage} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-pink-500">主页<ExternalLink size={11} /></a>}
    </div>
  </div>
)

const InstallByName: React.FC = () => {
  const [name, setName] = useState('')
  const market = useMarket()
  const busy = market.busy.has(name.trim())
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (name.trim() && await install(name.trim())) setName('')
  }
  return (
    <form onSubmit={submit} className="card p-4 flex flex-wrap items-center gap-3">
      <span className="text-sm text-theme-secondary">按包名安装</span>
      <input value={name} onChange={event => setName(event.target.value)} placeholder="luckylillia-plugin-xxx" className="input-field flex-1 min-w-[200px] font-mono text-sm" />
      <button type="submit" disabled={!name.trim() || busy} className="btn-glass flex items-center gap-1.5 text-sm">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        安装
      </button>
    </form>
  )
}

const SearchView: React.FC = () => {
  const ctx = usePluginContext()
  const [text, setText] = useState('')
  const [query, setQuery] = useState({ text: '', page: 1 })
  const [result, setResult] = useState<{ total: number; items: SearchItem[] } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    ctx.api<{ total: number; items: SearchItem[] }>(`/api/market/search?q=${encodeURIComponent(query.text)}&page=${query.page}`)
      .then(data => current && setResult(data), e => current && setError(errorText(e)))
      .finally(() => current && setLoading(false))
    return () => {
      current = false
    }
  }, [ctx, query])

  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1
  return (
    <div className="space-y-4">
      <form onSubmit={(event) => { event.preventDefault(); setQuery({ text: text.trim(), page: 1 }) }} className="card p-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint pointer-events-none" />
          <input value={text} onChange={event => setText(event.target.value)} placeholder="搜索插件，留空列出全部" className="input-field pl-10" />
        </div>
        <button type="submit" className="btn-primary flex items-center gap-1.5">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          搜索
        </button>
      </form>

      {error && (
        <div className="card p-4 flex items-start gap-2 text-sm text-red-500">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <div>搜索失败：{error}</div>
            <div className="text-theme-muted mt-1">可以点插件列表里「插件市场」卡片上的齿轮，换一个搜索用的源；或者在下面按包名直接安装。</div>
          </div>
        </div>
      )}

      {!error && result && result.items.length === 0 && !loading && (
        <div className="card p-10 text-center text-theme-secondary">
          没有找到插件。插件要在 package.json 的 keywords 里写上 luckylillia-plugin 才搜得到。
        </div>
      )}

      {result && result.items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {result.items.map(item => <ResultCard key={item.name} item={item} />)}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-theme-secondary">
          <button type="button" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })} className="btn-glass disabled:opacity-40" title="上一页">
            <ChevronLeft size={18} />
          </button>
          {query.page} / {pages}
          <button type="button" disabled={query.page >= pages} onClick={() => setQuery({ ...query, page: query.page + 1 })} className="btn-glass disabled:opacity-40" title="下一页">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <InstallByName />
    </div>
  )
}

const UninstallButton: React.FC<{ pkg: InstalledPackage }> = ({ pkg }) => {
  const [asking, setAsking] = useState(false)
  const entries = usePlugins()?.filter(plugin => plugin.name === pkg.name).length ?? 0
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="btn-glass flex items-center gap-1.5 text-sm text-red-500">
        <Trash2 size={16} />卸载
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-theme-secondary">删掉这个包{entries > 0 ? `和它 ${entries} 个实例的配置` : ''}？</span>
      <button type="button" onClick={() => { setAsking(false); uninstall(pkg.name) }} className="btn-glass text-red-500">卸载</button>
      <button type="button" onClick={() => setAsking(false)} className="btn-glass">取消</button>
    </div>
  )
}

const InstalledRow: React.FC<{ pkg: InstalledPackage }> = ({ pkg }) => {
  const market = useMarket()
  const info = market.updates?.[pkg.name]
  const busy = market.busy.has(pkg.name)
  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="font-medium text-theme">{titleOf(pkg.name)}</div>
        <div className="text-xs text-theme-muted font-mono">{pkg.name} · {pkg.version}</div>
        {!pkg.managed && <div className="text-xs text-theme-muted">在 {pkg.root}，是开发目录或链接，市场不动它</div>}
        {info?.update && <div className="text-xs text-pink-500">有新版本 {info.update}</div>}
        {info?.blocked && <div className="text-xs text-amber-600 dark:text-amber-400">最新的 {info.latest} 跑不了：{info.blocked}</div>}
        {info?.deprecated && <div className="text-xs text-amber-600 dark:text-amber-400">作者弃用了这个版本：{info.deprecated}</div>}
        {info?.error && <div className="text-xs text-red-500">检查更新失败：{info.error}</div>}
      </div>
      {busy && <Loader2 size={18} className="animate-spin text-theme-muted" />}
      {!busy && pkg.managed && info?.update && (
        <button type="button" onClick={() => install(pkg.name)} className="btn-primary flex items-center gap-1.5 text-sm">
          <ArrowUpCircle size={16} />更新到 {info.update}
        </button>
      )}
      {!busy && pkg.managed && <UninstallButton pkg={pkg} />}
    </div>
  )
}

const InstalledView: React.FC<{ onSearch(): void }> = ({ onSearch }) => {
  const market = useMarket()
  if (!market.installed) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-theme-secondary">{market.installed.length} 个插件包</span>
        {market.checkedAt > 0 && <span className="text-xs text-theme-muted">{new Date(market.checkedAt).toLocaleTimeString()} 检查过更新</span>}
        <div className="flex-1" />
        <button type="button" onClick={() => checkUpdates(true)} disabled={market.checking} className="btn-glass flex items-center gap-1.5 text-sm">
          <RefreshCw size={16} className={market.checking ? 'animate-spin' : ''} />检查更新
        </button>
      </div>
      {market.installed.length === 0 ? (
        <div className="card p-10 text-center text-theme-secondary">
          还没有装插件。<button type="button" onClick={onSearch} className="text-pink-500 hover:underline">去搜索</button>
        </div>
      ) : (
        <div className="card divide-y divide-black/5 dark:divide-white/10">
          {market.installed.map(pkg => <InstalledRow key={pkg.name} pkg={pkg} />)}
        </div>
      )}
    </div>
  )
}

/** The plugin market, a view of the plugin page (`plugins.views`): search and what is installed. The sources are its config, behind the card's gear */
const MarketView: React.FC = () => {
  const market = useMarket()
  const [view, setView] = useState<'search' | 'installed'>('search')
  const updates = Object.values(market.updates ?? {}).filter(info => info.update).length
  return (
    <div className="space-y-6">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setView('search')} className={tab(view === 'search')}>搜索</button>
          <button type="button" onClick={() => setView('installed')} className={tab(view === 'installed')}>
            已安装{updates > 0 && <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-pink-500 text-white text-[11px]">{updates}</span>}
          </button>
        </div>
        <p className="flex-1 min-w-[14rem] text-xs text-theme-muted sm:text-right">从 npm 搜索、安装和更新插件；新装的插件默认不启用，到「插件列表」里启用</p>
      </div>
      {view === 'search' && <SearchView />}
      {view === 'installed' && <InstalledView onSearch={() => setView('search')} />}
    </div>
  )
}

const UpdateBadge: React.FC<{ plugin: PluginEntryStatus }> = ({ plugin }) => {
  const market = useMarket()
  const update = market.updates?.[plugin.name]?.update
  if (!update) return null
  const busy = market.busy.has(plugin.name)
  return (
    <button type="button" disabled={busy} onClick={() => install(plugin.name)} title="从插件市场更新" className="btn-glass flex items-center gap-1 text-xs text-pink-500">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpCircle size={14} />}
      更新到 {update}
    </button>
  )
}

/** After the tab's name: how many installed packages have an update */
const UpdateCount: React.FC = () => {
  const market = useMarket()
  const updates = Object.values(market.updates ?? {}).filter(info => info.update).length
  if (!updates) return null
  return <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-pink-500 text-white text-[11px]">{updates}</span>
}

const apply: WebUIPlugin = (ctx) => {
  store.ctx = ctx
  // A tab of the plugin page rather than a page of its own: finding plugins and switching them on go together
  ctx.slot('plugins.views', { id: 'market', label: '插件市场', component: MarketView, title: '插件市场', badge: UpdateCount, order: 10 })
  ctx.slot('plugins.card.actions', { id: 'market-update', label: '插件更新', component: UpdateBadge })
}

export default apply
