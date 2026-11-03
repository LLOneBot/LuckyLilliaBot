import React, { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

/**
 * Whether logs go to files as well. A bot setting (`log` in settings.json): the files are written by the bot's own
 * logger from the moment it starts, before any plugin, so the switch is shown here but kept with the bot.
 */
const LogFileSwitch: React.FC = () => {
  const ctx = usePluginContext()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ctx.api('/api/config').then(
      (data: { config: { log?: boolean } }) => setOn(data.config.log !== false),
      () => setOn(null),
    )
  }, [])

  const toggle = async (next: boolean) => {
    setBusy(true)
    try {
      await ctx.api('/api/config', { method: 'POST', body: { config: { log: next } } })
      setOn(next)
      ctx.toast(next ? '日志会同时写入文件' : '日志不再写入文件')
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (on === null) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 pt-4 border-t border-theme-divider">
      <FileText size={16} className="text-theme-muted flex-shrink-0" />
      <span className="text-sm text-theme">写入日志文件</span>
      <span className="flex-1 min-w-0 text-xs text-theme-muted">文件在 data/logs/，超过 14 天的自动删除</span>
      <input type="checkbox" className="switch-toggle" checked={on} disabled={busy} onChange={e => toggle(e.target.checked)} />
    </div>
  )
}

export default LogFileSwitch
