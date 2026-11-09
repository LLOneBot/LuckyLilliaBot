import React, { useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, ArrowUpCircle, ChevronLeft, ChevronRight, Download, ExternalLink, Image, Loader2, PackageCheck, Puzzle, RefreshCw, Search,
  Trash2,
} from 'lucide-react'
import {
  Lightbox, usePluginContext, usePlugins, type PluginEntryStatus, type WebUIContext, type WebUIPlugin,
} from '@luckylillia/plugin-sdk/webui'
import { imageUrl, previewImages, type CatalogScreenshot } from '../images'
import LocalInstallButton from './LocalInstallButton'

export const name = 'builtin:market'

// What /api/market answers (src/plugin/internal/tool/market/index.ts)
interface SearchItem {
  name: string
  title: string
  version: string
  description: string
  author: { name: string; url?: string }
  repository: string
  icon?: string
  screenshots?: readonly CatalogScreenshot[]
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
  dependencies?: {
    name: string
    version: string
    previous?: string
    entries: string[]
    reload?: InstallOutcome['reload']
  }[]
}

const PAGE_SIZE = 20
const UPDATE_CHECK_INTERVAL = 10 * 60_000
// Local uploads do not reveal their package name until the server validates them.
const LOCAL_INSTALL = ':local'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const titleOf = (name: string) => name.replace(/^(@[^/]+\/)?luckylillia-plugin-/, '')

// One copy of the installed packages and their updates for the view, its tab's count and the cards
const store = {
  ctx: undefined as WebUIContext | undefined,
  installed: null as InstalledPackage[] | null,
  installedError: '',
  loadingInstalled: false,
  updates: null as Record<string, UpdateInfo> | null,
  updatesError: '',
  checking: false,
  checkedAt: 0,
  /** Packages being installed or removed */
  busy: new Set<string>(),
  listeners: new Set<() => void>(),
  version: 0,
}
let installedRequest = 0
let updateRequest = 0

function emit() {
  store.version++
  for (const listener of store.listeners) listener()
}

async function loadInstalled() {
  const request = ++installedRequest
  store.loadingInstalled = true
  emit()
  try {
    const installed = await store.ctx!.api<InstalledPackage[]>('/api/market/installed')
    if (request === installedRequest) {
      store.installed = installed
      store.installedError = ''
    }
  } catch (e) {
    if (request === installedRequest) store.installedError = errorText(e)
  } finally {
    if (request === installedRequest) {
      store.loadingInstalled = false
      emit()
    }
  }
}

async function checkUpdates(force = false) {
  if (store.busy.size || (!force && (store.checking || Date.now() - store.checkedAt < UPDATE_CHECK_INTERVAL))) return
  const request = ++updateRequest
  store.checking = true
  store.updatesError = ''
  emit()
  try {
    const updates = await store.ctx!.api<Record<string, UpdateInfo>>('/api/market/updates')
    if (request === updateRequest) {
      store.updates = updates
      store.checkedAt = Date.now()
    }
  } catch (e) {
    if (request === updateRequest) {
      store.updates = null
      store.checkedAt = 0
      store.updatesError = errorText(e)
    }
  } finally {
    if (request === updateRequest) {
      store.checking = false
      emit()
    }
  }
}

function invalidateUpdates() {
  // Installing/removing any package can change another plugin's dependency constraints.
  // Ignore checks already in flight and refresh the whole result after the operation.
  updateRequest++
  store.updates = null
  store.checkedAt = 0
  store.checking = false
  store.updatesError = ''
}

async function refreshMarket() {
  await Promise.all([loadInstalled(), checkUpdates(true)])
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

async function install(name: string, version: string): Promise<boolean> {
  return performInstall(name, titleOf(name), () => store.ctx!.api<InstallOutcome>('/api/market/install', { body: { name, version } }))
}

async function installLocal(file: File): Promise<boolean> {
  if (store.busy.size || !store.installed || store.installedError) return false
  const body = new FormData()
  body.set('file', file)
  body.set('confirm', 'true')
  return performInstall(LOCAL_INSTALL, file.name, () => store.ctx!.api<InstallOutcome>('/api/market/install-local', { body }))
}

async function performInstall(key: string, label: string, request: () => Promise<InstallOutcome>): Promise<boolean> {
  if (store.busy.has(key) || store.busy.has(LOCAL_INSTALL)) return false
  const ctx = store.ctx!
  store.busy.add(key)
  invalidateUpdates()
  emit()
  try {
    const outcome = await request()
    const name = outcome.name
    let what = outcome.previous
      ? `已把 ${titleOf(name)} 从 ${outcome.previous} 更新到 ${outcome.version}`
      : `已安装 ${titleOf(name)} ${outcome.version}`
    if (outcome.dependencies?.length) {
      what += `；同时安装或更新了依赖插件：${outcome.dependencies.map(dep => `${titleOf(dep.name)} ${dep.version}`).join('、')}`
    }
    if (!outcome.previous || outcome.dependencies?.some(dep => !dep.previous)) what += '；新装的插件请到「插件列表」里启用'
    const reload = outcome.reload
    if (reload?.status === 'restart-required') ctx.toast(`${what}，重启 Bot 后生效：${reload.reason}`, 'warning')
    else if (reload?.status === 'failed') ctx.toast(`${what}，但重新加载失败，还在跑旧版本：${reload.reason}`, 'error')
    else ctx.toast(what)
    for (const dep of outcome.dependencies ?? []) {
      if (dep.reload?.status === 'restart-required') ctx.toast(`依赖插件 ${titleOf(dep.name)} 需要重启 Bot 后生效：${dep.reload.reason}`, 'warning')
      else if (dep.reload?.status === 'failed') ctx.toast(`依赖插件 ${titleOf(dep.name)} 重新加载失败，还在跑旧版本：${dep.reload.reason}`, 'error')
    }
    if (outcome.scripts.length) {
      ctx.toast(`这些包带安装脚本，没有运行：${outcome.scripts.join('、')}。需要编译的原生模块会加载失败`, 'warning')
    }
    return true
  } catch (e) {
    ctx.toast(`安装 ${label} 失败：${errorText(e)}`, 'error')
    return false
  } finally {
    await loadInstalled()
    store.busy.delete(key)
    emit()
    await checkUpdates(true)
  }
}

async function uninstall(name: string) {
  if (store.busy.has(name) || store.busy.has(LOCAL_INSTALL)) return
  const ctx = store.ctx!
  store.busy.add(name)
  invalidateUpdates()
  emit()
  try {
    await ctx.api('/api/market/uninstall', { body: { name } })
    ctx.toast(`已卸载 ${titleOf(name)}`)
  } catch (e) {
    ctx.toast(`卸载 ${titleOf(name)} 失败：${errorText(e)}`, 'error')
  } finally {
    await loadInstalled()
    store.busy.delete(name)
    emit()
    await checkUpdates(true)
  }
}

const tab = (active: boolean) => `px-3 py-1.5 rounded-full text-sm transition-colors ${
  active ? 'gradient-primary text-white' : 'bg-theme-item text-theme-secondary hover:text-theme hover:bg-theme-item-hover'
}`

const InstallButton: React.FC<{ item: SearchItem }> = ({ item }) => {
  const market = useMarket()
  const installedPackage = market.installed?.find(pkg => pkg.name === item.name)
  const installed = market.installed ? installedPackage?.version : item.installed
  const canUpdate = installedPackage?.managed && market.updates?.[item.name]?.update === item.version
  if (market.busy.has(item.name)) {
    return <button type="button" disabled className="btn-glass flex items-center gap-1.5 text-sm"><Loader2 size={16} className="animate-spin" />请稍候</button>
  }
  if (market.installedError) {
    return <span title="加载已安装插件失败，请先重试" className="shrink-0 text-sm text-theme-muted px-2 py-1.5">状态未知</span>
  }
  if (installed && !canUpdate) {
    return <span title={`已装 ${installed}`} className="flex items-center gap-1.5 text-sm text-theme-muted px-2 py-1.5"><PackageCheck size={16} />已安装</span>
  }
  return (
    <button type="button" disabled={market.busy.has(LOCAL_INSTALL)} onClick={() => install(item.name, item.version)} className="btn-primary flex items-center gap-1.5 text-sm" title={installed ? `已装 ${installed}，更新到 ${item.version}` : undefined}>
      {installed ? <ArrowUpCircle size={16} /> : <Download size={16} />}
      {installed ? '更新' : '安装'}
    </button>
  )
}

const MarketIcon: React.FC<{ item: SearchItem }> = ({ item }) => {
  const [broken, setBroken] = useState<string>()
  const url = imageUrl(item, item.icon)
  return (
    <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden fill-quiet flex items-center justify-center text-theme-muted">
      {url && url !== broken ? (
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(url)} className="w-full h-full object-cover" />
      ) : <Puzzle size={22} aria-hidden="true" />}
    </div>
  )
}

const ResultCard: React.FC<{ item: SearchItem }> = ({ item }) => {
  const [preview, setPreview] = useState<number | null>(null)
  const images = previewImages(item)
  return (
    <>
      <div className="card p-4 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <MarketIcon item={item} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-theme break-words">{item.title}</div>
            <div className="text-xs text-theme-muted font-mono break-all">{item.name} · {item.version}</div>
          </div>
          <InstallButton item={item} />
        </div>
        {item.description && <p className="text-sm text-theme-secondary line-clamp-2">{item.description}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-theme-muted break-words [&>a]:min-w-0 [&>span]:min-w-0">
          {item.author.url
            ? <a href={item.author.url} target="_blank" rel="noopener noreferrer" title="作者" className="hover:text-pink-500">{item.author.name}</a>
            : <span title="作者">{item.author.name}</span>}
          <a href={`https://www.npmjs.com/package/${item.name}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-pink-500">npm<ExternalLink size={11} /></a>
          <a href={item.repository} target="_blank" rel="noopener noreferrer" title="GitHub 仓库" aria-label={`${item.title} 的 GitHub 仓库`} className="inline-flex items-center justify-center p-1 rounded hover:text-pink-500">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8" />
            </svg>
          </a>
          {images.length > 0 && (
            <button type="button" onClick={() => setPreview(0)} aria-label={`${item.title} 的截图预览`} className="inline-flex items-center gap-1 hover:text-pink-500">
              <Image size={14} />预览
            </button>
          )}
        </div>
      </div>
      {preview !== null && <Lightbox images={images} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />}
    </>
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
          <input value={text} onChange={event => setText(event.target.value)} placeholder="搜索插件名或包名，留空列出全部" className="input-field pl-10" />
        </div>
        <button type="submit" className="btn-primary flex items-center gap-1.5">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          搜索
        </button>
      </form>

      {error && (
        <div role="alert" className="card p-4 flex flex-wrap items-start gap-2 text-sm text-red-500">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 break-words">
            <div>搜索失败：{error}</div>
            <div className="text-theme-muted mt-1">请点插件列表里「插件市场」卡片上的齿轮，检查 npm 源和目录包设置，然后重试。</div>
          </div>
          <button type="button" onClick={() => setQuery({ ...query })} disabled={loading} className="btn-glass text-theme">重试</button>
        </div>
      )}

      {!error && result && result.items.length === 0 && !loading && (
        <div className="card p-10 text-center text-theme-secondary">
          {query.text ? '没有找到匹配的插件。' : '当前市场目录暂无收录的插件。'}
          <a href="https://github.com/LLOneBot/LuckyLillia.Market/issues/new/choose" target="_blank" rel="noopener noreferrer" className="ml-1 text-pink-500 hover:underline">登记插件</a>
        </div>
      )}

      {!error && result && result.items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {result.items.map(item => <ResultCard key={item.name} item={item} />)}
        </div>
      )}

      {!error && pages > 1 && (
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
  const available = !busy && !market.busy.has(LOCAL_INSTALL) && !market.installedError
  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 space-y-0.5 break-words">
        <div className="font-medium text-theme">{titleOf(pkg.name)}</div>
        <div className="text-xs text-theme-muted font-mono break-all">{pkg.name} · {pkg.version}</div>
        {!pkg.managed && <div className="text-xs text-theme-muted">在 {pkg.root}，是开发目录或链接，市场不动它</div>}
        {info?.update && <div className="text-xs text-pink-500">有新版本 {info.update}</div>}
        {info?.blocked && <div className="text-xs text-amber-600 dark:text-amber-400">{info.latest && `市场版本 ${info.latest} 无法更新：`}{info.blocked}</div>}
        {info?.deprecated && <div className="text-xs text-amber-600 dark:text-amber-400">作者弃用了这个版本：{info.deprecated}</div>}
        {info?.error && <div className="text-xs text-red-500">检查更新失败：{info.error}</div>}
      </div>
      {busy && <Loader2 size={18} className="animate-spin text-theme-muted" />}
      {available && pkg.managed && info?.update && (
        <button type="button" onClick={() => install(pkg.name, info.update!)} className="btn-primary flex items-center gap-1.5 text-sm">
          <ArrowUpCircle size={16} />更新到 {info.update}
        </button>
      )}
      {available && pkg.managed && <UninstallButton pkg={pkg} />}
    </div>
  )
}

const InstalledView: React.FC<{ onSearch(): void }> = ({ onSearch }) => {
  const market = useMarket()
  if (!market.installed && !market.installedError) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-theme-secondary">{market.installed ? `${market.installed.length} 个插件包` : '已安装插件'}</span>
        {market.checkedAt > 0 && <span className="text-xs text-theme-muted">{new Date(market.checkedAt).toLocaleTimeString()} 检查过更新</span>}
        <div className="flex-1" />
        <button type="button" onClick={refreshMarket} disabled={market.checking || market.loadingInstalled || market.busy.size > 0} className="btn-glass flex items-center gap-1.5 text-sm">
          <RefreshCw size={16} className={market.checking || market.loadingInstalled ? 'animate-spin' : ''} />检查更新
        </button>
      </div>
      {market.installed?.length === 0 && !market.installedError ? (
        <div className="card p-10 text-center text-theme-secondary">
          还没有装插件。<button type="button" onClick={onSearch} className="text-pink-500 hover:underline">去搜索</button>
        </div>
      ) : !!market.installed?.length && (
        <div className="card divide-y divide-black/5 dark:divide-white/10">
          {market.installed.map(pkg => <InstalledRow key={pkg.name} pkg={pkg} />)}
        </div>
      )}
    </div>
  )
}

/** The plugin market, a view of the plugin page (`plugins.views`): search and what is installed. The registry and catalog are configured behind the card's gear */
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
        <LocalInstallButton
          busy={market.busy.has(LOCAL_INSTALL)}
          disabled={!market.installed || !!market.installedError || market.busy.size > 0}
          onInstall={installLocal}
        />
        <p className="w-full text-xs text-theme-muted">安装时会从插件市场补齐所需插件；新装的插件和依赖默认不启用，到「插件列表」里启用</p>
      </div>
      {(market.installedError || market.updatesError) && (
        <div role="alert" className="card p-4 flex flex-wrap items-start gap-2 text-sm text-red-500">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1 break-words">
            {market.installedError && <div>加载已安装插件失败：{market.installedError}{market.installed && '（保留上次加载的列表，请重试后操作）'}</div>}
            {market.updatesError && <div>检查更新失败：{market.updatesError}</div>}
          </div>
          <button type="button" onClick={refreshMarket} disabled={market.checking || market.loadingInstalled || market.busy.size > 0} className="btn-glass text-theme">重试</button>
        </div>
      )}
      {view === 'search' && <SearchView />}
      {view === 'installed' && <InstalledView onSearch={() => setView('search')} />}
    </div>
  )
}

const UpdateBadge: React.FC<{ plugin: PluginEntryStatus }> = ({ plugin }) => {
  const market = useMarket()
  const update = market.updates?.[plugin.name]?.update
  if (!update || market.installedError) return null
  const busy = market.busy.has(plugin.name) || market.busy.has(LOCAL_INSTALL)
  return (
    <button type="button" disabled={busy} onClick={() => install(plugin.name, update)} title="从插件市场更新" className="btn-glass flex items-center gap-1 text-xs text-pink-500">
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
