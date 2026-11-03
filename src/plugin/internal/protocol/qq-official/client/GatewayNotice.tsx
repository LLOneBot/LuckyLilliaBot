import React from 'react'
import { StatusNotice, useBots, usePluginStatus } from '@luckylillia/plugin-sdk/webui'

// Status of @satorijs/protocol
const ONLINE = 1
const CONNECT = 2
const RECONNECT = 4

/** The bot not on the gateway, at the top of the settings page. The WebUI says itself when the plugin failed or still wants its AppID. */
const GatewayNotice: React.FC = () => {
  const entry = usePluginStatus()
  const bots = useBots()
  if (entry?.state !== 'active' || entry.disabled || entry.notice || !bots) return null
  const bot = bots.find(item => item.platform === 'qq')
  if (bot?.status === ONLINE) return null
  if (!bot || bot.status === CONNECT || bot.status === RECONNECT) return <StatusNotice>正在连接 QQ 开放平台…</StatusNotice>
  return <StatusNotice>没有连上 QQ 开放平台，原因见日志</StatusNotice>
}

export default GatewayNotice
