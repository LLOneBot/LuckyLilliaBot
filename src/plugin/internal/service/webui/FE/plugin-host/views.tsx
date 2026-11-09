import React, { createContext, Fragment, ReactNode, useMemo } from 'react'
import type { PageView } from '@luckylillia/plugin-sdk/webui'
import { AlertTriangle, Loader2, PowerOff } from 'lucide-react'
import { pendingReason, pluginTitle, spaced, STATE_LABEL, waitingFor } from '../components/plugins/meta'
import type { PluginStatus } from '../types/plugins'
import { PluginBoundary } from './context'
import { usePluginList } from './pluginList'
import {
  activeOwners, configEditorOf, contributionKey, contributionLabel, declarationOf, fieldRendererOf, PageContribution,
  PagePurpose, pageContributionKey, slotContents, SlotContribution, SlotDeclaration, slotMatches, useRegistry, visiblePages,
} from './registry'

/** Pages for the sidebar; see PagePurpose for the others. */
export function useVisiblePages(purpose: PagePurpose = 'sidebar'): PageContribution[] {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  return useMemo(() => visiblePages(contributions, plugins, purpose, prefs), [contributions, plugins, purpose, prefs])
}

export function useConfigEditor(owner: string) {
  const contributions = useRegistry(state => state.contributions)
  return useMemo(() => configEditorOf(contributions, owner), [contributions, owner])
}

export function useFieldRenderer(role: string | undefined) {
  const contributions = useRegistry(state => state.contributions)
  return useMemo(() => (role ? fieldRendererOf(contributions, role) : undefined), [contributions, role])
}

/** How the plugin page names a contribution in a sentence: the slot, then the contribution. */
export function describeContribution(declaration: SlotDeclaration | undefined, contribution: SlotContribution): string {
  return `${declaration?.title ?? contribution.slot}「${contributionLabel(contribution)}」`
}

interface SlotOutletProps {
  name: string
  props?: Record<string, unknown>
  /** For a `keyed` slot: which key to draw. */
  match?: string
  /**
   * What goes around each contribution, e.g. a card; the boundary is inside it, so the frame outlives an error. A
   * `chain` has no frames.
   */
  wrap?: (element: ReactNode, contribution: SlotContribution) => ReactNode
  /** The slot's own content: shown while no contribution is, and innermost in a `chain`. */
  children?: ReactNode
}

/**
 * The contributions of running plugins to a slot, minus what the user hid, each in its own boundary. Without
 * `wrap` there is no element of its own around them, so a container stays `:empty` when they all render nothing.
 */
export const SlotOutlet: React.FC<SlotOutletProps> = ({ name, props, match, wrap, children }) => {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  const contents = useMemo(
    () => slotContents(contributions, activeOwners(plugins), name, prefs, match),
    [contributions, plugins, prefs, name, match],
  )
  if (!contents.length) return <>{children}</>
  const declaration = declarationOf(contributions, name)
  const failure = (contribution: SlotContribution) => ({
    key: contributionKey(contribution),
    where: describeContribution(declaration, contribution),
  })
  if (declaration?.cardinality === 'chain') {
    // From the inside out: each link gets what the ones after it drew, and a link that throws stands aside
    const chained = contents.reduceRight<ReactNode>((next, contribution) => {
      const { owner, component: Component } = contribution
      return (
        <PluginBoundary owner={owner} failure={failure(contribution)} passThrough={next}>
          <Component {...props} next={next} />
        </PluginBoundary>
      )
    }, children ?? null)
    return <>{chained}</>
  }
  return (
    <>
      {contents.map((contribution) => {
        const { owner, component: Component } = contribution
        const element = (
          <PluginBoundary owner={owner} failure={failure(contribution)} inline>
            <Component {...props} />
          </PluginBoundary>
        )
        return <Fragment key={contributionKey(contribution)}>{wrap ? wrap(element, contribution) : element}</Fragment>
      })}
    </>
  )
}

/** What a slot shows right now, for its owner to lay out itself, e.g. the plugin page's tabs. */
export function useSlotContents(name: string): SlotContribution[] {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  return useMemo(() => slotContents(contributions, activeOwners(plugins), name, prefs), [contributions, plugins, prefs, name])
}

/** The keys a `keyed` slot has a contribution for right now. */
export function useSlotMatches(name: string): string[] {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  return useMemo(() => slotMatches(contributions, activeOwners(plugins), name, prefs), [contributions, plugins, prefs, name])
}

const WINDOWED: PageView = { fullscreen: false }
const FULLSCREEN: PageView = { fullscreen: true }

export const PageViewContext = createContext<PageView>(WINDOWED)

/** Tab id of each plugin's settings page, by package name. */
export function useSettingsPages(): Map<string, string> {
  const contributions = useRegistry(state => state.contributions)
  return useMemo(() => new Map(contributions
    .filter((c): c is PageContribution => c.kind === 'page' && c.settings)
    .map(page => [page.owner, page.key])), [contributions])
}

/** The entry a page belongs to, a running one first, and whether one of the plugin's entries runs. */
function usePageOwner(owner: string) {
  const plugins = usePluginList(state => state.plugins)
  return useMemo(() => {
    const entries = plugins?.filter(entry => entry.name === owner) ?? []
    const active = entries.find(entry => entry.state === 'active')
    // Not in the list (a hidden entry, or the list not in yet): nothing to say about it
    return { plugins: plugins ?? [], plugin: active ?? entries.find(entry => !entry.disabled) ?? entries[0], running: !!active || !entries.length }
  }, [plugins, owner])
}

interface Blocker {
  headline: string
  detail: string
  /** Where to see to it: a tab */
  action?: { label: string; tab: string }
}

/**
 * What keeps a plugin from running, as its pages say it. Undefined while nothing does, or while it only waits for
 * what the bot brings up by itself a moment later (waitingFor), which would only flash past.
 */
function blockerOf(plugin: PluginStatus, plugins: PluginStatus[], settingsPages: Map<string, string>, settings: boolean): Blocker | undefined {
  const title = `「${pluginTitle(plugin)}」`
  const toPlugins = { label: '前往插件页', tab: 'plugins' }
  if (plugin.disabled) {
    return { headline: `${title}已在插件页停用`, detail: settings ? '这里的设置要等它启用后才会生效' : '启用后才能用这个页面', action: toPlugins }
  }
  if (plugin.state === 'failed') return { headline: `${title}运行出错`, detail: plugin.error ?? '未知错误', action: toPlugins }
  if (plugin.state === 'missing' || plugin.state === 'incompatible') {
    return { headline: `${title}没能加载`, detail: plugin.error ?? STATE_LABEL[plugin.state].label, action: toPlugins }
  }
  const waiting = waitingFor(plugin, plugins)
  if (!waiting) return
  const provider = `「${pluginTitle(waiting.provider)}」`
  if (waiting.provider.disabled) return { headline: `${title}还没运行起来`, detail: `需要先启用${provider}`, action: toPlugins }
  return {
    headline: `${title}还没运行起来`,
    detail: `要等${waiting.label ? spaced(waiting.label) : `${provider}就绪`}后才会运行`,
    action: { label: '去看看', tab: settingsPages.get(waiting.provider.name) ?? 'plugins' },
  }
}

const go = (tab: string) => () => {
  window.location.hash = tab
}

/** A notice at the top of a plugin page: the WebUI's own (PluginPage) and the plugin's (SDK StatusNotice) */
export const PageNotice: React.FC<{ children: React.ReactNode; action?: { label: string; onClick(): void } }> = ({ children, action }) => (
  <div className="card p-4 mb-6 flex items-center gap-3 border border-amber-300/60 dark:border-amber-500/40">
    <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
    <p className="flex-1 text-sm text-theme-secondary">{children}</p>
    {action && <button type="button" onClick={action.onClick} className="btn-glass text-sm flex-shrink-0">{action.label}</button>}
  </div>
)

/** In place of a page whose plugin does not run: why, and where to see to it. */
const PluginNotRunning: React.FC<{ plugin: PluginStatus; plugins: PluginStatus[]; blocker?: Blocker }> = ({ plugin, plugins, blocker }) => {
  if (!blocker) {
    const reason = pendingReason(plugin, plugins)
    return (
      <div className="card p-10 text-center">
        <Loader2 size={36} className="mx-auto animate-spin text-pink-500 mb-4" />
        <p className="text-theme font-medium">「{pluginTitle(plugin)}」正在启动</p>
        {reason && <p className="text-sm text-theme-secondary mt-2">{reason}</p>}
      </div>
    )
  }
  return (
    <div className="card p-10 text-center">
      <PowerOff size={40} className="mx-auto text-theme-hint mb-4" />
      <p className="text-theme font-medium">{blocker.headline}</p>
      <p className="text-sm text-theme-secondary mt-2">{blocker.detail}</p>
      {blocker.action && <button type="button" onClick={go(blocker.action.tab)} className="btn-glass mt-6">{blocker.action.label}</button>}
    </div>
  )
}

/**
 * A plugin page. It is in the sidebar while its plugin is enabled, so it is up to the page to say what keeps the
 * plugin from running: a settings page is there to set the plugin up and shows under a notice, any other page needs
 * the plugin running and is replaced by the reason until it does.
 */
export const PluginPage: React.FC<{ page: PageContribution; fullscreen?: boolean }> = ({ page, fullscreen = false }) => {
  const { owner, component: Component } = page
  const { plugins, plugin, running } = usePageOwner(owner)
  const settingsPages = useSettingsPages()
  const blocker = plugin && !running ? blockerOf(plugin, plugins, settingsPages, page.settings) : undefined
  if (!page.settings && !running) return <PluginNotRunning plugin={plugin!} plugins={plugins} blocker={blocker} />
  const notice = blocker ? `${blocker.headline}：${blocker.detail}`
    : page.settings && plugin?.notice ? `「${pluginTitle(plugin)}」${plugin.notice}` : undefined
  return (
    <>
      {notice && <PageNotice action={blocker?.action && { label: blocker.action.label, onClick: go(blocker.action.tab) }}>{notice}</PageNotice>}
      {/* One boundary per page, so that an error on one page does not stick to the next one of the same plugin */}
      <PageViewContext.Provider value={fullscreen ? FULLSCREEN : WINDOWED}>
        <PluginBoundary key={page.key} owner={owner} failure={{ key: pageContributionKey(page), where: `页面「${page.title}」` }}>
          <Component />
        </PluginBoundary>
      </PageViewContext.Provider>
    </>
  )
}

/** What a page draws above itself (`header` of its options). */
export const PluginPageHeader: React.FC<{ page: PageContribution }> = ({ page }) => {
  const { running } = usePageOwner(page.owner)
  const Header = page.header
  // Goes with the page: not drawn while the page is replaced by why its plugin does not run
  if (!Header || (!page.settings && !running)) return null
  return (
    <PluginBoundary key={page.key} owner={page.owner} failure={{ key: `${pageContributionKey(page)}|header`, where: `页面「${page.title}」的标题` }} inline>
      <Header />
    </PluginBoundary>
  )
}

/**
 * Shown on a tab no page is registered for: a package's pages come with its WebUI module, which is not loaded while
 * the plugin is off; or nothing provides that page at all.
 */
export const PluginPageUnavailable: React.FC<{ tab: string }> = ({ tab }) => {
  const plugins = usePluginList(state => state.plugins)
  if (plugins === null) {
    return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  }
  // `<package>:<page id>`
  const owner = tab.includes(':') ? plugins.find(entry => tab.startsWith(`${entry.name}:`)) : undefined
  let title = '没有这个页面'
  let detail = '提供它的插件可能没有安装或没有启用'
  if (owner?.disabled) {
    title = `「${pluginTitle(owner)}」已在插件页停用`
    detail = '启用后才能用这个页面'
  }
  return (
    <div className="card p-10 text-center">
      <PowerOff size={40} className="mx-auto text-theme-hint mb-4" />
      <p className="text-theme font-medium">{title}</p>
      <p className="text-sm text-theme-secondary mt-2">{detail}</p>
      <button type="button" onClick={() => { window.location.hash = 'plugins' }} className="btn-glass mt-6">前往插件页</button>
    </div>
  )
}
