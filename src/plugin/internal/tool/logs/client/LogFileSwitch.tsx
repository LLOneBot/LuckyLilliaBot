import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileText, ListFilter, Loader2, Lock } from 'lucide-react'
import { SelectInput, usePluginContext } from '@luckylillia/plugin-sdk/webui'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: { value: LogLevel; label: string }[] = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
]

interface LogSettings {
  log: boolean
  logLevel: LogLevel
  lockedBy?: string
}

interface ConfigResponse {
  config: { log?: boolean; logLevel?: LogLevel }
  envLocked?: { path: string; by: string }[]
}

/**
 * The bot's logging settings, kept in settings.json because its logger starts before any plugin.
 * Each change only writes its own field and takes effect without restarting the bot.
 */
const LogFileSwitch: React.FC = () => {
  const ctx = usePluginContext()
  const [settings, setSettings] = useState<LogSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const saving = useRef(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    ctx.api<ConfigResponse>('/api/config').then(
      data => {
        if (cancelled) return
        setSettings({
          log: data.config.log !== false,
          logLevel: LEVELS.some(level => level.value === data.config.logLevel) ? data.config.logLevel! : 'info',
          lockedBy: data.envLocked?.find(lock => lock.path === 'logLevel')?.by,
        })
      },
      e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载日志设置失败')
      },
    )
    return () => { cancelled = true }
  }, [ctx, reload])

  const save = async (patch: Partial<Pick<LogSettings, 'log' | 'logLevel'>>, message: string) => {
    if (!settings || saving.current || (patch.logLevel && settings.lockedBy)) return
    saving.current = true
    setBusy(true)
    try {
      await ctx.api('/api/config', { method: 'POST', body: { config: patch } })
      setSettings(current => current && { ...current, ...patch })
      ctx.toast(message)
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const loading = (
    <div className="flex items-center gap-2 pt-4 text-xs text-theme-muted">
      {error ? (
        <>
          <span role="alert" className="min-w-0 flex-1 break-words text-red-500">{error}</span>
          <button className="btn-glass px-3 py-1.5 flex-shrink-0" onClick={() => { setError(null); setReload(value => value + 1) }}>重试</button>
        </>
      ) : <><Loader2 size={16} className="animate-spin flex-shrink-0" />正在加载日志设置…</>}
    </div>
  )

  const lockedHint = settings?.lockedBy && (settings.lockedBy.startsWith('-')
    ? `由启动参数 ${settings.lockedBy} 指定，这里改不了`
    : `由环境变量 ${settings.lockedBy} 指定，这里改不了`)

  return (
    <details className="group mt-4 pt-4 border-t border-theme-divider" open={expanded}
      onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-theme-secondary [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90" />
        日志设置
      </summary>
      {expanded && (!settings ? loading : (
        <div className="space-y-4 pt-4" aria-busy={busy}>
          <div className="flex items-center gap-3">
            <ListFilter size={16} className="text-theme-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-theme">日志级别</span>
              <p className="mt-1 text-xs text-theme-muted">记录所选级别及更严重的日志，修改立即生效，适用于日志页、控制台和日志文件。</p>
              {lockedHint && (
                <p className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <Lock size={12} className="mt-0.5 flex-shrink-0" /><span className="min-w-0 break-words">{lockedHint}</span>
                </p>
              )}
            </div>
            <SelectInput<LogLevel>
              value={settings.logLevel}
              options={LEVELS}
              disabled={busy || !!settings.lockedBy}
              onChange={next => { if (next !== settings.logLevel) void save({ logLevel: next }, '日志级别已生效') }}
              className="w-24 flex-shrink-0 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-theme-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-theme">写入日志文件</span>
              <p className="mt-1 text-xs text-theme-muted">文件在 data/logs/，超过 14 天的自动删除</p>
            </div>
            <input
              type="checkbox"
              aria-label="写入日志文件"
              className="switch-toggle flex-shrink-0"
              checked={settings.log}
              disabled={busy}
              onChange={e => {
                const next = e.target.checked
                void save({ log: next }, next ? '日志会同时写入文件' : '日志不再写入文件')
              }}
            />
          </div>
        </div>
      ))}
    </details>
  )
}

export default LogFileSwitch
