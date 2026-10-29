import { useEffect, useState } from 'react'
import { usePluginContext, type WebUIContext } from '@luckylillia/plugin-sdk/webui'

export interface NTStats {
  online: boolean
  uin: string
  nick: string
  mode: 'direct' | 'pmhq'
  protocol?: string
  version?: string
  friendCount?: number
  groupCount?: number
  messageReceived?: number
  messageSent?: number
  qq?: { memory: number; totalMemory: number; memoryPercent: number; cpu: number }
}

const POLL_INTERVAL = 5000

let latest: NTStats | null = null
const listeners = new Set<(stats: NTStats) => void>()
let timer: ReturnType<typeof setInterval> | undefined

function start(ctx: WebUIContext) {
  const poll = () => ctx.api<NTStats>('/api/ntqq/stats')
    .then((stats) => {
      latest = stats
      for (const listener of listeners) listener(stats)
    })
    .catch(() => {})
  poll()
  timer = setInterval(poll, POLL_INTERVAL)
}

/** `/api/ntqq/stats`, polled while something shows it: the Dashboard's cards share one poll. */
export function useNTStats(): NTStats | null {
  const ctx = usePluginContext()
  const [stats, setStats] = useState(latest)
  useEffect(() => {
    listeners.add(setStats)
    if (listeners.size === 1) start(ctx)
    return () => {
      listeners.delete(setStats)
      if (listeners.size) return
      clearInterval(timer)
      timer = undefined
    }
  }, [ctx])
  return stats
}
