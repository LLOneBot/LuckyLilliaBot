import React from 'react'
import { usePluginList } from '../../plugin-host/pluginList'
import { useBots } from '../../stores/botsStore'
import { pluginCategory } from '../plugins/listing'

// Status of @satorijs/protocol
const ONLINE = 1

interface StatusNoticesProps {
  activeTab: string
  onOpen: (tab: string) => void
}

/**
 * What is wrong with the bot as a whole, above every page: no protocol plugin enabled and no bot online. What concerns
 * one plugin (waiting for another, failed, settings missing, not connected) is said on that plugin's own pages, by
 * PluginPage or the page itself, and on its card in the plugin page.
 */
const StatusNotices: React.FC<StatusNoticesProps> = ({ activeTab, onOpen }) => {
  const bots = useBots(state => state.bots)
  const plugins = usePluginList(state => state.plugins)
  // Nothing known for sure before both have answered; the plugin page is where it is seen to
  if (!bots || !plugins || activeTab === 'plugins') return null
  // A plugin's own protocol counts as much as the builtin ones
  if (bots.some(bot => bot.status === ONLINE) || plugins.some(plugin => !plugin.disabled && pluginCategory(plugin) === 'protocol')) return null
  return (
    <div className="card px-5 py-3 mb-6 flex items-center gap-3 text-sm">
      <span className="text-theme-secondary flex-1">没有启用任何协议端，机器人还收发不了消息</span>
      <button onClick={() => onOpen('plugins')} className="btn-glass px-4 py-1.5 text-sm flex-shrink-0">前往插件页</button>
    </div>
  )
}

export default StatusNotices
