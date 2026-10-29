import React, { createContext, Fragment, ReactNode, useMemo } from 'react'
import type { PageView } from '@luckylillia/plugin-sdk/webui'
import { AlertTriangle, Loader2, PowerOff } from 'lucide-react'
import { pendingReason, pluginTitle, STATE_LABEL } from '../components/plugins/meta'
import { PluginBoundary } from './context'
import { usePluginList } from './pluginList'
import {
  activeOwners, configEditorOf, contributionKey, contributionLabel, declarationOf, fieldRendererOf, PageContribution,
  pageContributionKey, slotContents, SlotContribution, SlotDeclaration, slotMatches, useRegistry, visiblePages,
} from './registry'

/** Pages for the sidebar, or with `open`, pages a tab may show. */
export function useVisiblePages(purpose: 'sidebar' | 'open' = 'sidebar'): PageContribution[] {
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

export const PluginPage: React.FC<{ page: PageContribution; fullscreen?: boolean }> = ({ page, fullscreen = false }) => {
  const { owner, component: Component } = page
  const plugin = usePluginList(state => state.plugins?.find(entry => entry.name === owner))
  // Pending is left alone: right after login the builtins are briefly waiting for their services
  const notice = page.settings && plugin && (plugin.disabled
    ? `「${pluginTitle(plugin)}」已在插件页停用，这里的设置要等它启用后才会生效`
    : plugin.state === 'failed' ? `「${pluginTitle(plugin)}」运行出错：${plugin.error ?? '未知错误'}`
    : plugin.notice ? `「${pluginTitle(plugin)}」${plugin.notice}` : undefined)
  // What the notice asks for is on this page, not the plugin page
  const toPlugins = !!plugin && (plugin.disabled || plugin.state === 'failed')
  return (
    <>
      {notice && (
        <div className="card p-4 mb-6 flex items-center gap-3 border border-amber-300/60 dark:border-amber-500/40">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
          <p className="flex-1 text-sm text-theme-secondary">{notice}</p>
          {toPlugins && (
            <button type="button" onClick={() => { window.location.hash = 'plugins' }} className="btn-glass text-sm flex-shrink-0">
              前往插件页
            </button>
          )}
        </div>
      )}
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
  const Header = page.header
  if (!Header) return null
  return (
    <PluginBoundary key={page.key} owner={page.owner} failure={{ key: `${pageContributionKey(page)}|header`, where: `页面「${page.title}」的标题` }} inline>
      <Header />
    </PluginBoundary>
  )
}

/** Shown on a tab whose page is not there: its plugin does not run, or nothing registers that page. */
export const PluginPageUnavailable: React.FC<{ tab: string }> = ({ tab }) => {
  const plugins = usePluginList(state => state.plugins)
  const contributions = useRegistry(state => state.contributions)
  if (plugins === null) {
    return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  }
  const page = contributions.find((c): c is PageContribution => c.kind === 'page' && c.key === tab)
  const plugin = page && plugins.find(entry => entry.name === page.owner)
  let title = '没有这个页面'
  let detail = '提供它的插件可能没有安装或没有启用'
  if (plugin && page) {
    if (plugin.disabled) {
      title = `「${page.title}」所属的插件已停用`
      detail = `在插件页启用「${pluginTitle(plugin)}」后才能使用`
    } else {
      title = `「${page.title}」所属的插件还没运行起来`
      detail = pendingReason(plugin, plugins) ?? plugin.error ?? STATE_LABEL[plugin.state].label
    }
  } else if (plugin === undefined && tab.includes(':')) {
    const owner = plugins.find(entry => tab.startsWith(`${entry.name}:`))
    if (owner?.webui && !owner.webuiApproved) {
      title = `「${pluginTitle(owner)}」的界面还没有批准`
      detail = '在插件页的「界面」里批准后，它的页面才会加载'
    }
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
