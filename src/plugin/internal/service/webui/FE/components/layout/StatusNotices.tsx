import React from 'react'
import { usePluginList } from '../../plugin-host/pluginList'
import { SlotOutlet, useSettingsPages } from '../../plugin-host'
import { useBots } from '../../stores/botsStore'
import { PluginStatus } from '../../types/plugins'
import { pluginTitle, spaced, waitingFor } from '../plugins/meta'
import { pluginCategory } from '../plugins/listing'

// Status of @satorijs/protocol
const ONLINE = 1

interface Notice {
  key: string
  text: string
  action: string
  tab: string
}

function names(plugins: PluginStatus[]): string {
  const titles = plugins.map(pluginTitle)
  return titles.length > 3 ? `${titles.slice(0, 3).join('、')} 等 ${titles.length} 个插件` : titles.join('、')
}

interface StatusNoticesProps {
  activeTab: string
  onOpen: (tab: string) => void
}

/**
 * What keeps enabled plugins from running, said plugin by plugin: whose service they wait for, which failed,
 * which still want settings. Plugins add lines of their own through the `shell.notices` slot, e.g. an account that is
 * not logged in. A line is left out on the page it points to; the bar goes when nothing is left.
 */
const StatusNotices: React.FC<StatusNoticesProps> = ({ activeTab, onOpen }) => {
  const bots = useBots(state => state.bots)
  const plugins = usePluginList(state => state.plugins)
  const settingsPages = useSettingsPages()
  // Nothing known for sure before both have answered
  if (!bots || !plugins) return null

  const notices: Notice[] = []
  const enabled = plugins.filter(plugin => !plugin.disabled)
  const anyOnline = bots.some(bot => bot.status === ONLINE)
  const pageOf = (plugin: PluginStatus) => settingsPages.get(plugin.name) ?? 'plugins'

  // Waiting plugins, by the plugin providing what they wait for
  const waiting = new Map<string, { provider: PluginStatus; label?: string; plugins: PluginStatus[] }>()
  for (const plugin of enabled) {
    const reason = waitingFor(plugin, plugins)
    if (!reason) continue
    const group = waiting.get(reason.provider.id) ?? { provider: reason.provider, plugins: [] }
    group.label ??= reason.label
    group.plugins.push(plugin)
    waiting.set(reason.provider.id, group)
  }
  for (const { provider, label, plugins: waiters } of waiting.values()) {
    const title = pluginTitle(provider)
    notices.push(provider.disabled
      ? { key: `waiting-${provider.id}`, text: `${names(waiters)} 需要启用「${title}」才会运行`, action: '前往插件页', tab: 'plugins' }
      : { key: `waiting-${provider.id}`, text: `${names(waiters)} 要等${label ? spaced(label) : `「${title}」就绪`}后才会运行`, action: '去看看', tab: pageOf(provider) })
  }

  for (const plugin of enabled) {
    if (plugin.state === 'active' && plugin.notice) {
      notices.push({ key: `notice-${plugin.id}`, text: `${pluginTitle(plugin)}${plugin.notice}`, action: '去设置', tab: pageOf(plugin) })
    }
  }

  const failed = enabled.filter(plugin => plugin.state === 'failed')
  if (failed.length) {
    const text = failed.length === 1 && failed[0].error
      ? `${pluginTitle(failed[0])} 运行出错：${failed[0].error}`
      : `${names(failed)} 运行出错`
    notices.push({ key: 'failed', text, action: failed.length === 1 ? '去看看' : '前往插件页', tab: failed.length === 1 ? pageOf(failed[0]) : 'plugins' })
  }

  // A plugin's own protocol counts as much as the builtin ones
  if (!anyOnline && !enabled.some(plugin => pluginCategory(plugin) === 'protocol')) {
    notices.push({ key: 'none', text: '没有启用任何协议端，机器人还收发不了消息', action: '前往插件页', tab: 'plugins' })
  }

  const shown = notices.filter(notice => notice.tab !== activeTab)
  return (
    <div className="card px-5 py-3 mb-6 space-y-2 text-sm empty:hidden">
      {shown.map(notice => (
        <div key={notice.key} className="flex items-center gap-3">
          <span className="text-theme-secondary flex-1">{notice.text}</span>
          <button onClick={() => onOpen(notice.tab)} className="btn-glass px-4 py-1.5 text-sm flex-shrink-0">{notice.action}</button>
        </div>
      ))}
      <SlotOutlet name="shell.notices" />
    </div>
  )
}

export default StatusNotices
