import React, { useEffect, useState } from 'react'
import { usePluginList } from '../../plugin-host/pluginList'
import { useQQAccount } from '../../stores/accountStore'
import { PluginStatus } from '../../types/plugins'
import { apiFetch } from '../../utils/api'
import { pluginTitle } from '../plugins/meta'
import { pluginCategory } from '../plugins/listing'

interface BotInfo {
  sid: string
  platform: string
  selfId: string
  status: number
}

// Status of @satorijs/protocol
const ONLINE = 1
const CONNECT = 2
const RECONNECT = 4
const POLL_INTERVAL = 5000

/** The accounts plugins send through and whether each is online; null until the first answer. */
function useBots(): BotInfo[] | null {
  const [bots, setBots] = useState<BotInfo[] | null>(null)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const res = await apiFetch<BotInfo[]>('/api/bots')
        if (!stopped && res.success) setBots(res.data)
      } catch {
        // Keeps the last answer
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL)
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])
  return bots
}

interface Notice {
  key: string
  text: string
  action: string
  tab: string
}

const QQ_OFFICIAL = 'builtin:qq-official'

function names(plugins: PluginStatus[]): string {
  const titles = plugins.map(pluginTitle)
  return titles.length > 3 ? `${titles.slice(0, 3).join('、')} 等 ${titles.length} 个插件` : titles.join('、')
}

interface StatusNoticesProps {
  activeTab: string
  ntProtocolOn: boolean
  onOpen: (tab: string) => void
}

/**
 * What keeps enabled plugins from running, said plugin by plugin: which wait for the NTQQ login, what the official
 * bot lacks, which failed. An account is only mentioned for what needs it, so nobody reads it as "log in to
 * everything"; when no account at all can send, that is said too. A line is left out on the page it points to.
 */
const StatusNotices: React.FC<StatusNoticesProps> = ({ activeTab, ntProtocolOn, onOpen }) => {
  const bots = useBots()
  const account = useQQAccount(state => state.account)
  const plugins = usePluginList(state => state.plugins)
  // Nothing known for sure before both have answered
  if (!bots || !plugins) return null

  const notices: Notice[] = []
  const enabled = plugins.filter(plugin => !plugin.disabled)
  const anyOnline = bots.some(bot => bot.status === ONLINE)

  // `account` only comes with the NTQQ login
  const waiting = enabled.filter(plugin => plugin.state === 'pending' && plugin.missingDeps.includes('account'))
  if (waiting.length) {
    notices.push(ntProtocolOn
      ? { key: 'ntqq-waiting', text: `${names(waiting)} 要等 NTQQ 账号登录后才会运行`, action: '去登录', tab: 'ntqq' }
      : { key: 'ntqq-waiting', text: `${names(waiting)} 需要启用 NTQQ 协议才会运行`, action: '前往插件页', tab: 'plugins' })
  } else if (ntProtocolOn && !anyOnline) {
    notices.push(account
      ? { key: 'ntqq', text: 'NTQQ 协议的 QQ 账号已离线', action: '去查看', tab: 'ntqq' }
      : { key: 'ntqq', text: 'NTQQ 协议的 QQ 账号还没有登录', action: '去登录', tab: 'ntqq' })
  }

  const official = enabled.find(plugin => plugin.name === QQ_OFFICIAL)
  if (official) {
    const bot = bots.find(item => item.platform === 'qq')
    const connecting = official.state === 'loading' || (official.state === 'active' && !official.notice
      && (!bot || bot.status === CONNECT || bot.status === RECONNECT))
    let text: string | undefined
    if (official.state === 'failed') text = `QQ 官方机器人没能启动：${official.error ?? '未知错误'}`
    else if (official.notice) text = `QQ 官方机器人${official.notice}`
    // Passing by on its own; worth a word only while it is the account everything waits for
    else if (connecting) text = anyOnline ? undefined : 'QQ 官方机器人正在连接开放平台'
    else if (official.state === 'active' && bot && bot.status !== ONLINE) text = 'QQ 官方机器人没有连上开放平台，原因见日志'
    if (text) notices.push({ key: 'qqofficial', text, action: '去设置', tab: 'qqofficial' })
  }

  const failed = enabled.filter(plugin => plugin.state === 'failed' && plugin.name !== QQ_OFFICIAL)
  if (failed.length) {
    const text = failed.length === 1 && failed[0].error
      ? `${pluginTitle(failed[0])} 运行出错：${failed[0].error}`
      : `${names(failed)} 运行出错`
    notices.push({ key: 'failed', text, action: '前往插件页', tab: 'plugins' })
  }

  // A plugin's own protocol counts as much as the builtin ones
  if (!anyOnline && !enabled.some(plugin => pluginCategory(plugin) === 'protocol')) {
    notices.push({ key: 'none', text: '没有启用任何协议端，机器人还收发不了消息', action: '前往插件页', tab: 'plugins' })
  }

  const shown = notices.filter(notice => notice.tab !== activeTab)
  if (!shown.length) return null
  return (
    <div className="card px-5 py-3 mb-6 space-y-2 text-sm">
      {shown.map(notice => (
        <div key={notice.key} className="flex items-center gap-3">
          <span className="text-theme-secondary flex-1">{notice.text}</span>
          <button onClick={() => onOpen(notice.tab)} className="btn-glass px-4 py-1.5 text-sm flex-shrink-0">{notice.action}</button>
        </div>
      ))}
    </div>
  )
}

export default StatusNotices
