import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Settings2, X } from 'lucide-react'
import { DurationInput, usePluginContext } from '@luckylillia/plugin-sdk/webui'

/**
 * What is rarely changed, behind a button in the page's title, so the page itself is the login: for now how long
 * the protocol keeps the messages it sent and got (the bot setting `msgCacheExpire`, seconds), which replies,
 * recalls and lookups read. Applied as it is saved.
 */
const ProtocolSettings: React.FC = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors flex-shrink-0"
      >
        <Settings2 size={16} />
        更多设置
      </button>
      {open && createPortal(<SettingsDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

const SettingsDialog: React.FC<{ onClose(): void }> = ({ onClose }) => {
  const ctx = usePluginContext()
  const [seconds, setSeconds] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ctx.api('/api/config').then(
      (data: { config: { msgCacheExpire?: number } }) => setSeconds(data.config.msgCacheExpire ?? 120),
      (e: unknown) => {
        ctx.toast(e instanceof Error ? e.message : '读取设置失败', 'error')
        onClose()
      },
    )
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await ctx.api('/api/config', { method: 'POST', body: { config: { msgCacheExpire: seconds } } })
      ctx.toast('NTQQ 协议设置已保存')
      onClose()
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    // A click outside does not close it, or a stray one would drop what was being edited
    <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }}>
      <div className="glass glass-thick r-window glass-pop w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 hairline-b">
          <h3 className="text-lg font-semibold text-theme">NTQQ 协议 · 更多设置</h3>
          <button type="button" onClick={onClose} className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {seconds === null ? (
            <div className="flex justify-center py-6"><Loader2 size={24} className="animate-spin text-pink-500" /></div>
          ) : (
            <div>
              <div className="text-sm font-medium text-theme-secondary mb-2">消息缓存</div>
              <DurationInput value={seconds} onChange={setSeconds} maxDays={1} showSeconds={false} />
              <p className="text-xs text-theme-muted mt-2">收发的消息在内存里留多久，引用回复、撤回、查消息时要用；全填 0 是不缓存，最长 1 天</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button type="button" onClick={onClose} className="px-5 py-2 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors">取消</button>
          <button type="button" onClick={save} disabled={saving || seconds === null} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 size={18} className="animate-spin" />}保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProtocolSettings
