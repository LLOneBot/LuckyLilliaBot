import React from 'react'
import { StatusNotice, useBots, usePluginStatus } from '@luckylillia/plugin-sdk/webui'

// Status of @satorijs/protocol
const ONLINE = 1
const CONNECT = 2
const RECONNECT = 4

/** The bot not on the gateway. The WebUI says itself when the plugin failed or still wants its AppID. */
const Notices: React.FC = () => {
  const entry = usePluginStatus()
  const bots = useBots()
  if (entry?.state !== 'active' || entry.disabled || entry.notice || !bots) return null
  const bot = bots.find(item => item.platform === 'qq')
  if (bot?.status === ONLINE) return null
  if (!bot || bot.status === CONNECT || bot.status === RECONNECT) {
    // Passing by on its own; worth a word only while it is the account everything waits for
    if (bots.some(item => item.status === ONLINE)) return null
    return <StatusNotice action="去设置" page="qqofficial">QQ 官方机器人正在连接开放平台</StatusNotice>
  }
  return <StatusNotice action="去设置" page="qqofficial">QQ 官方机器人没有连上开放平台，原因见日志</StatusNotice>
}

export default Notices
