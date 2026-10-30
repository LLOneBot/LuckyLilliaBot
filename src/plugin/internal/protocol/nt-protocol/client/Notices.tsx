import React from 'react'
import { StatusNotice, useBots, usePlugins, usePluginStatus } from '@luckylillia/plugin-sdk/webui'

// Status of @satorijs/protocol
const ONLINE = 1

/**
 * The account not online, said only while no account at all is: plugins waiting for it are listed by the WebUI
 * already (the `account` label in the manifest), and with another account online it is no news.
 */
const Notices: React.FC = () => {
  const entry = usePluginStatus()
  const bots = useBots()
  const plugins = usePlugins()
  if (entry?.state !== 'active' || entry.disabled || !bots || !plugins) return null
  if (bots.some(bot => bot.status === ONLINE)) return null
  if (plugins.some(plugin => !plugin.disabled && plugin.state === 'pending' && plugin.missingDeps.includes('account'))) return null
  // The neutral layer brings the account's bot up with the first login
  const seen = bots.some(bot => bot.platform === 'luckylillia')
  return seen
    ? <StatusNotice action="去查看" page="ntqq">NTQQ 协议的 QQ 账号已离线</StatusNotice>
    : <StatusNotice action="去登录" page="ntqq">NTQQ 协议的 QQ 账号还没有登录</StatusNotice>
}

export default Notices
