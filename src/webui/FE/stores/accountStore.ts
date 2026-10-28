import { useEffect } from 'react'
import { create } from 'zustand'
import { showToast } from '../components/common/Toast'
import { apiFetch } from '../utils/api'

/** The scanned QQ account as the WebUI found it when the page loaded; logging in or out reloads the page. */
export const useQQAccount = create<{ account: { uin: string; nick: string } | null }>(() => ({ account: null }))

const POLL_INTERVAL = 5000

/**
 * Reloads the page once an account other than the one it loaded with is online, wherever the login came from:
 * the sidebar, WebQQ's per-account data and the QQ version are only read at page load. The NTQQ page does
 * the same right away for a login done on it.
 */
export function useAccountReload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const res = await apiFetch<{ online: boolean; uin: string }>('/api/login-info')
        if (stopped) return
        if (res.success && res.data.online && res.data.uin !== useQQAccount.getState().account?.uin) {
          showToast('QQ 登录成功', 'success')
          setTimeout(() => window.location.reload(), 1000)
          return
        }
      } catch {
        // Tried again next round
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL)
    }
    timer = setTimeout(poll, POLL_INTERVAL)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [enabled])
}
