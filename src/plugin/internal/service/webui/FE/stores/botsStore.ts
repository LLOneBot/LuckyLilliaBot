import { useEffect } from 'react'
import { create } from 'zustand'
import type { BotInfo } from '@luckylillia/plugin-sdk/webui'
import { apiFetch } from '../utils/api'

/** The accounts plugins chat through, from /api/bots; null until the first answer. */
export const useBots = create<{ bots: BotInfo[] | null }>(() => ({ bots: null }))

const POLL_INTERVAL = 5000

/** Keeps useBots current while the WebUI is logged in. */
export function useBotsPolling(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const res = await apiFetch<BotInfo[]>('/api/bots')
        if (!stopped && res.success) useBots.setState({ bots: res.data })
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
  }, [enabled])
}
