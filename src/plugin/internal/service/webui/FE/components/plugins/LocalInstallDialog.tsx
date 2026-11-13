import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileUp, FolderOpen, FolderSearch, Loader2, X } from 'lucide-react'
import { SlotOutlet } from '../../plugin-host/views'
import { getPluginDirectories } from '../../utils/pluginApi'

interface Props {
  scanning: boolean
  busy: boolean
  onScan(): Promise<void>
  onClose(): void
  onInstalled(): void
}

const LocalInstallDialog: React.FC<Props> = ({ scanning, busy, onScan, onClose, onInstalled }) => {
  const [directories, setDirectories] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const ref = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  useEffect(() => {
    let active = true
    setDirectories(null)
    setError('')
    getPluginDirectories().then(({ roots }) => { if (active) setDirectories(roots) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)) })
    return () => { active = false }
  }, [retry])
  return createPortal(
    <dialog ref={ref} aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose() }}
      className="r-window m-auto max-w-lg overflow-y-auto border-0 bg-transparent p-0 text-theme backdrop:bg-black/40"
      style={{ width: 'calc(100% - 2rem)', maxHeight: 'calc(100dvh - 2rem)' }}>
      <div className="glass glass-thick r-window">
        <div className="p-5 sm:p-6 flex items-center gap-3 hairline-b">
          <FileUp size={22} className="text-pink-500 shrink-0" />
          <h3 id={title} className="text-lg font-semibold flex-1">本地安装</h3>
          <button type="button" onClick={onClose} title="关闭" aria-label="关闭本地安装" className="p-2 -mr-2 rounded-lg text-theme-muted hover:bg-theme-item hover:text-theme"><X size={20} /></button>
        </div>
        <div className="p-5 sm:p-6 space-y-5">
          <div className="rounded-xl bg-theme-item p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="flex items-center gap-2 text-sm font-medium"><FolderOpen size={17} className="text-theme-muted" />插件目录</h4>
              <button type="button" disabled={scanning || busy} onClick={() => void onScan()} title="扫描插件目录"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-theme-secondary hover:text-theme hover:bg-theme-item-hover disabled:opacity-40">
                {scanning ? <Loader2 size={15} className="animate-spin" /> : <FolderSearch size={15} />}
                {scanning ? '正在扫描…' : '扫描'}
              </button>
            </div>
            {error ? <div role="alert" className="flex items-start gap-2 text-xs">
              <p className="min-w-0 flex-1 break-words text-red-500">读取插件目录失败：{error}</p>
              <button type="button" onClick={() => setRetry(value => value + 1)} className="shrink-0 text-pink-500 hover:underline">重试</button>
            </div> : directories === null ? <p className="text-xs text-theme-muted">正在读取插件目录…</p> : directories.length ? (
              <div className="space-y-2">
                {directories.map((directory, index) => <div key={directory + index}>
                  {index > 0 && <p className="mb-1 text-xs text-theme-muted">其他扫描目录</p>}
                  <code className="block text-xs sm:text-sm leading-relaxed break-all select-all">{directory}</code>
                </div>)}
              </div>
            ) : <p className="text-xs text-theme-muted">尚未配置插件目录</p>}
            <p className="text-xs text-theme-muted leading-relaxed">也可以将解压后的插件放入目录，再点击扫描。每个插件放在独立文件夹内，新插件默认停用。</p>
          </div>
          <SlotOutlet name="plugins.install" props={{ onInstalled, disabled: scanning }}>
            <p className="text-sm text-theme-secondary">启用「插件市场」后可上传插件包。</p>
          </SlotOutlet>
        </div>
      </div>
    </dialog>, document.body,
  )
}

export default LocalInstallDialog
