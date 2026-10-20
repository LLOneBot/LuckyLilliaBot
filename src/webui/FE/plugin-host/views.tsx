import React, { useMemo } from 'react'
import { AlertTriangle, Loader2, PowerOff } from 'lucide-react'
import { pendingReason, pluginTitle, STATE_LABEL } from '../components/plugins/meta'
import { PluginBoundary } from './context'
import { usePluginList } from './pluginList'
import {
  activeOwners, configEditorOf, fieldRendererOf, PageContribution, slotContents, useRegistry, visiblePages,
} from './registry'

/** Pages for the sidebar, or with `open`, pages a tab may show. */
export function useVisiblePages(purpose: 'sidebar' | 'open' = 'sidebar'): PageContribution[] {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  return useMemo(() => visiblePages(contributions, plugins, purpose), [contributions, plugins, purpose])
}

export function useConfigEditor(owner: string) {
  const contributions = useRegistry(state => state.contributions)
  return useMemo(() => configEditorOf(contributions, owner), [contributions, owner])
}

export function useFieldRenderer(role: string | undefined) {
  const contributions = useRegistry(state => state.contributions)
  return useMemo(() => (role ? fieldRendererOf(contributions, role) : undefined), [contributions, role])
}

/** What running plugins put into a named place of the layout; nothing at all when none did. */
export const PluginSlot: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const contents = useMemo(() => slotContents(contributions, activeOwners(plugins), name), [contributions, plugins, name])
  if (!contents.length) return null
  return (
    <div className={className}>
      {contents.map(({ owner, component: Component }) => (
        <PluginBoundary key={owner} owner={owner}><Component /></PluginBoundary>
      ))}
    </div>
  )
}

/** Tab id of each plugin's settings page, by package name. */
export function useSettingsPages(): Map<string, string> {
  const contributions = useRegistry(state => state.contributions)
  return useMemo(() => new Map(contributions
    .filter((c): c is PageContribution => c.kind === 'page' && c.settings)
    .map(page => [page.owner, page.key])), [contributions])
}

export const PluginPage: React.FC<{ page: PageContribution }> = ({ page }) => {
  const { owner, component: Component } = page
  const plugin = usePluginList(state => state.plugins?.find(entry => entry.name === owner))
  // Pending is left alone: right after login the builtins are briefly waiting for their services
  const notice = page.settings && plugin && (plugin.disabled
    ? `「${pluginTitle(plugin)}」已在插件页停用，这里的设置要等它启用后才会生效`
    : plugin.state === 'failed' ? `「${pluginTitle(plugin)}」运行出错，这里的设置暂时不会生效：${plugin.error ?? '未知错误'}` : undefined)
  return (
    <>
      {notice && (
        <div className="card p-4 mb-6 flex items-center gap-3 border border-amber-300/60 dark:border-amber-500/40">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
          <p className="flex-1 text-sm text-theme-secondary">{notice}</p>
          <button type="button" onClick={() => { window.location.hash = 'plugins' }} className="btn-glass text-sm flex-shrink-0">
            前往插件页
          </button>
        </div>
      )}
      {/* One boundary per page, so that an error on one page does not stick to the next one of the same plugin */}
      <PluginBoundary key={page.key} owner={owner}><Component /></PluginBoundary>
    </>
  )
}

/** Shown on a tab whose page is not there: its plugin does not run, or nothing registers that page. */
export const PluginPageUnavailable: React.FC<{ tab: string }> = ({ tab }) => {
  const plugins = usePluginList(state => state.plugins)
  const contributions = useRegistry(state => state.contributions)
  if (plugins === null) {
    return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  }
  const key = tab === 'webqq-fullscreen' ? 'webqq' : tab
  const page = contributions.find((c): c is PageContribution => c.kind === 'page' && c.key === key)
  const plugin = page && plugins.find(entry => entry.name === page.owner)
  let title = '没有这个页面'
  let detail = '提供它的插件可能没有安装或没有启用'
  if (plugin && page) {
    if (plugin.disabled) {
      title = `「${page.title}」所属的插件已停用`
      detail = `在插件页启用「${pluginTitle(plugin)}」后才能使用`
    } else {
      title = `「${page.title}」所属的插件还没运行起来`
      detail = pendingReason(plugin) ?? plugin.error ?? STATE_LABEL[plugin.state].label
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
