import { useEffect, useState } from 'react'
import { usePluginContext, type WebUIContext } from '@luckylillia/plugin-sdk/webui'

/** `/api/dashboard/stats`: the bot process and the machine. */
export interface DashboardStats {
  version: string
  startupTime: number
  bot: {
    memory: number
    totalMemory: number
    memoryPercent: number
    cpu: number
  }
  system?: {
    memory: number
    totalMemory: number
    memoryPercent: number
    cpu: number
    label?: string
  }
}

export interface StatsState {
  stats: DashboardStats | null
  /** Nothing came back yet, and the last try failed. */
  failed: boolean
}

const USE_MOCK_DATA = false
const POLL_INTERVAL = 5000

const generateMockStats = (): DashboardStats => ({
  version: 'dev',
  startupTime: Math.floor(Date.now() / 1000) - 3600 * 5 - 1234,
  bot: {
    memory: (80 + Math.random() * 40) * 1024 * 1024,
    totalMemory: 16 * 1024 * 1024 * 1024,
    memoryPercent: 2 + Math.random() * 3,
    cpu: 3 + Math.random() * 10,
  },
  system: {
    memory: (6 + Math.random() * 3) * 1024 * 1024 * 1024,
    totalMemory: 16 * 1024 * 1024 * 1024,
    memoryPercent: 38 + Math.random() * 20,
    cpu: 10 + Math.random() * 25,
    label: '16 核',
  },
})

let latest: StatsState = { stats: null, failed: false }
const listeners = new Set<(state: StatsState) => void>()
let timer: ReturnType<typeof setInterval> | undefined

function publish(state: StatsState) {
  latest = state
  for (const listener of listeners) listener(state)
}

function start(ctx: WebUIContext) {
  const poll = () => (USE_MOCK_DATA ? Promise.resolve(generateMockStats()) : ctx.api<DashboardStats>('/api/dashboard/stats'))
    .then(stats => publish({ stats, failed: false }))
    .catch((error) => {
      console.error('Failed to fetch dashboard stats:', error)
      publish({ stats: latest.stats, failed: !latest.stats })
    })
  poll()
  timer = setInterval(poll, POLL_INTERVAL)
}

/** Polled while a card shows it: the Dashboard's own cards share one poll. */
export function useDashboardStats(): StatsState {
  const ctx = usePluginContext()
  const [state, setState] = useState(latest)
  useEffect(() => {
    listeners.add(setState)
    if (listeners.size === 1) start(ctx)
    return () => {
      listeners.delete(setState)
      if (listeners.size) return
      clearInterval(timer)
      timer = undefined
    }
  }, [ctx])
  return state
}
