import React, { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'
import type { QQSetupState } from '../setupTypes'

const API = '/api/qq-official/setup'
const active = (state: QQSetupState) => ['starting', 'waiting', 'saving'].includes(state.phase)

class SetupRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function request(ctx: ReturnType<typeof usePluginContext>, path: string, method = 'GET'): Promise<QQSetupState> {
  const response = await ctx.fetch(`${API}${path}`, { method, cache: 'no-store' })
  const value = await response.json().catch(() => null)
  if (!response.ok || !value) throw new SetupRequestError(value?.message || '扫码配置请求失败，请重试', response.status)
  return value
}

/** The browser only sees the QR and its status; the backend receives and saves the credentials. */
const QuickSetup: React.FC<{ configured: boolean; onComplete: () => void }> = ({ configured, onComplete }) => {
  const ctx = usePluginContext()
  const [state, setState] = useState<QQSetupState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = useRef<QQSetupState | null>(null)
  const generation = useRef(0)
  const alive = useRef(true)
  const completed = useRef('')
  const done = useRef(onComplete)
  done.current = onComplete

  const update = (next: QQSetupState | null) => {
    current.current = next
    setState(next)
  }

  useEffect(() => {
    alive.current = true
    // Deferring lets a discarded StrictMode mount cancel before it creates a remote task.
    const timer = setTimeout(() => void start(), 0)
    return () => {
      clearTimeout(timer)
      alive.current = false
      generation.current++
      const session = current.current
      if (session && active(session) && session.phase !== 'saving') {
        void request(ctx, `/${encodeURIComponent(session.id)}`, 'DELETE').catch(() => {})
      }
    }
  }, [ctx])

  useEffect(() => {
    if (!state || !active(state)) return
    const sessionId = state.id
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const poll = async () => {
      try {
        const next = await request(ctx, `/${encodeURIComponent(sessionId)}`)
        if (stopped || !alive.current || current.current?.id !== sessionId) return
        failures = 0
        setError('')
        update(next)
        if (next.phase === 'complete' && completed.current !== sessionId) {
          completed.current = sessionId
          ctx.toast('扫码配置已保存')
          done.current()
          return
        }
        if (!active(next)) return
      } catch (e) {
        if (stopped || !alive.current) return
        if (e instanceof SetupRequestError && e.status === 404) {
          update({ id: sessionId, phase: 'failed', message: e.message })
          return
        }
        setError(e instanceof Error ? e.message : '获取扫码状态失败')
        failures++
      }
      if (!stopped) timer = setTimeout(poll, Math.min(2000 * (failures + 1), 10000))
    }
    timer = setTimeout(poll, 1000)
    return () => { stopped = true; clearTimeout(timer) }
  }, [ctx, state?.id])

  const start = async () => {
    if (busy || state?.phase === 'saving') return
    const turn = ++generation.current
    setBusy(true)
    setError('')
    try {
      const next = await request(ctx, '/start', 'POST')
      if (!alive.current || generation.current !== turn) {
        void request(ctx, `/${encodeURIComponent(next.id)}`, 'DELETE').catch(() => {})
        return
      }
      update(next)
    } catch (e) {
      if (alive.current && generation.current === turn) setError(e instanceof Error ? e.message : '生成二维码失败')
    } finally {
      if (alive.current && generation.current === turn) setBusy(false)
    }
  }

  const saving = state?.phase === 'saving'
  const waiting = state?.phase === 'waiting'
  const creating = busy || (!state && !error) || state?.phase === 'starting'
  const retry = !busy && (state ? ['expired', 'failed', 'cancelled'].includes(state.phase) : !!error)
  const message = creating ? '正在生成二维码…' : state?.message || (state?.phase === 'expired' ? '二维码已过期，请重新生成。'
    : state?.phase === 'failed' ? '扫码配置失败，请重试。'
      : state?.phase === 'starting' ? '正在生成二维码…'
        : state?.phase === 'cancelled' ? '扫码已取消，可重新生成二维码。'
          : saving ? '扫码已确认，正在保存配置…' : '使用手机 QQ 扫码，并在手机上确认。')

  return (
    <div className="space-y-3">
      <p className="text-xs text-theme-muted">
        {configured ? '扫码确认后，将替换当前机器人的 AppID 和 AppSecret。' : '使用手机 QQ 扫码确认，自动保存 AppID 和 AppSecret。'}
      </p>
      <div className="rounded-xl border border-theme-divider p-4">
        {(!error || state) && <p className="text-sm text-theme-secondary" role="status">{message}</p>}
        {(creating || saving) && <Loader2 size={24} className="animate-spin mt-4 text-pink-500" />}
        {waiting && state.qrCode && (
          <img src={state.qrCode} alt="QQ 官方机器人配置二维码" className="mt-4 h-auto w-56 max-w-full rounded-xl bg-white p-2" />
        )}
        {waiting && state.url && (
          <a href={state.url} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-pink-500 hover:underline">
            <ExternalLink size={14} />在浏览器中打开扫码页面
          </a>
        )}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        {retry && (
          <button type="button" onClick={start} className="btn-primary mt-4 inline-flex items-center gap-2">
            <RefreshCw size={16} />重新生成二维码
          </button>
        )}
      </div>
    </div>
  )
}

export default QuickSetup
