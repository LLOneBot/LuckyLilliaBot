import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'

interface PluginUninstallDialogProps {
  title: string
  packageName: string
  busy: boolean
  onClose(): void
  onConfirm(keepConfig: boolean): void
}

const PluginUninstallDialog: React.FC<PluginUninstallDialogProps> = ({ title, packageName, busy, onClose, onConfirm }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const keepConfigId = useId()
  const [keepConfig, setKeepConfig] = useState(true)

  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    cancel.current?.focus()
    return () => {
      // Native close also fires during StrictMode cleanup; only explicit dismissals notify the parent.
      element.close()
      previous?.focus()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onClose() }}
      className="glass glass-thick r-window glass-pop fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[85dvh] overflow-y-auto border-0 p-0 text-theme backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start gap-3 p-4 sm:p-5 hairline-b">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/50 text-red-500"><Trash2 size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-base sm:text-lg font-semibold break-words [overflow-wrap:anywhere]">卸载「{title}」</h3>
          <p className="mt-1 text-xs text-theme-muted font-mono break-all">{packageName}</p>
        </div>
        <button type="button" title="关闭" aria-label="取消卸载" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-theme-muted hover:bg-theme-item hover:text-theme"><X size={19} /></button>
      </div>
      <div className="p-4 sm:p-5">
        <p id={descriptionId} className="text-sm text-theme-secondary">卸载会停用此插件的全部实例并删除插件文件。</p>
        <label htmlFor={keepConfigId} className="mt-4 inline-flex items-center gap-2 text-sm text-theme">
          <input id={keepConfigId} type="checkbox" checked={keepConfig} onChange={event => setKeepConfig(event.target.checked)} disabled={busy} className="accent-pink-500" />
          保留配置
        </label>
        <p className="mt-1 text-xs text-theme-muted">{keepConfig ? '重新安装时恢复各实例的配置，插件保持停用。' : '同时删除此插件全部实例的配置，重新安装需重新设置。'}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancel} type="button" autoFocus onClick={onClose} className="btn-glass">取消</button>
          <button type="button" disabled={busy} onClick={() => onConfirm(keepConfig)} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 disabled:pointer-events-none">确认卸载</button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

export default PluginUninstallDialog
