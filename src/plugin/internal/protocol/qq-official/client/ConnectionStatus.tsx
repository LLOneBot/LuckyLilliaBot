import React from 'react'
import { useBots, usePluginStatus } from '@luckylillia/plugin-sdk/webui'

// Status of @satorijs/protocol
const ONLINE = 1
/** Compact connection state beside the title; the host still explains missing credentials and plugin failures. */
const ConnectionStatus: React.FC = () => {
  const entry = usePluginStatus()
  const bots = useBots()
  const connected = entry?.state === 'active' && !entry.disabled && !entry.notice
    && bots?.some(bot => bot.platform === 'qq' && bot.status === ONLINE)
  return (
    <span role="status" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-theme-secondary">
      <span aria-hidden="true" className={'h-2 w-2 rounded-full ' + (connected ? 'bg-emerald-500' : 'bg-neutral-400')} />
      {connected ? '已连接' : '未连接'}
    </span>
  )
}

export default ConnectionStatus
