import React, { useId, useRef, useState } from 'react'
import { FileArchive, Loader2, ShieldAlert, Upload, X } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

interface Props {
  busy: boolean
  disabled: boolean
  error?: string
  onRetry(): void
  onInstall(file: File): Promise<boolean>
}

/** Upload controls inside the host's local installation dialog. */
const LocalInstallPanel: React.FC<Props> = ({ busy, disabled, error, onRetry, onInstall }) => {
  const ctx = usePluginContext()
  const input = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const confirmation = useId()
  const working = busy || submitting
  const blocked = disabled || working

  const select = (files: FileList | null) => {
    if (blocked || !files?.length) return
    if (files.length !== 1) {
      ctx.toast('请一次选择一个插件压缩包', 'error')
      return
    }
    const selected = files[0]
    if (!/[.](zip|tgz|tar[.]gz)$/i.test(selected.name)) {
      ctx.toast('请选择 ZIP 或 npm 格式的 .tgz / .tar.gz 插件包', 'error')
    } else if (!selected.size) {
      ctx.toast('插件压缩包不能为空', 'error')
    } else {
      setFile(selected)
      setConfirmed(false)
    }
  }

  const install = async () => {
    if (!file || !confirmed || blocked) return
    setSubmitting(true)
    try {
      if (await onInstall(file)) {
        setFile(null)
        setConfirmed(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={input}
        type="file"
        accept=".zip,.tgz,.tar.gz"
        aria-label="选择本地插件压缩包"
        className="hidden"
        disabled={blocked}
        onChange={event => {
          select(event.currentTarget.files)
          // Selecting the same file again must work after canceling or a failed install.
          event.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={blocked}
        onDragEnter={event => {
          event.preventDefault()
          if (blocked || !event.dataTransfer.types.includes('Files')) return
          dragDepth.current++
          setDragging(true)
        }}
        onDragOver={event => {
          event.preventDefault()
          event.dataTransfer.dropEffect = blocked ? 'none' : 'copy'
        }}
        onDragLeave={event => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (!dragDepth.current) setDragging(false)
        }}
        onDrop={event => {
          event.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          select(event.dataTransfer.files)
        }}
        className={`w-full rounded-2xl border border-dashed p-5 sm:p-7 text-center transition-colors disabled:opacity-50 ${dragging ? 'border-pink-400 bg-pink-500/10' : 'border-theme-divider bg-theme-item hover:bg-theme-item-hover'}`}
      >
        <Upload size={24} className="mx-auto mb-3 text-pink-500 pointer-events-none" />
        <span className="block text-sm font-medium text-theme pointer-events-none">{dragging ? '松开以选择插件包' : file ? '点击更换或拖入另一个插件包' : '选择插件包，或拖到这里'}</span>
        <span className="block mt-1.5 text-xs text-theme-muted pointer-events-none">支持 .zip、.tgz、.tar.gz</span>
      </button>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-500">
          <span className="flex-1 min-w-0 break-words">加载已安装插件失败：{error}</span>
          <button type="button" onClick={onRetry} disabled={working} className="btn-glass text-theme">重试</button>
        </div>
      )}

      {file ? (
        <>
          <div className="rounded-xl bg-theme-item p-3 flex items-center gap-3 text-sm">
            <FileArchive size={20} className="shrink-0 text-theme-muted" />
            <div className="min-w-0 flex-1">
              <div className="break-all text-theme">{file.name}</div>
              <div className="text-xs text-theme-muted mt-1">{file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KiB` : `${(file.size / 1024 / 1024).toFixed(2)} MiB`}</div>
            </div>
            <button type="button" onClick={() => { setFile(null); setConfirmed(false) }} disabled={working} title="移除文件" aria-label="移除选中的插件包" className="shrink-0 rounded-lg p-1.5 text-theme-muted hover:text-theme hover:bg-theme-item-hover disabled:opacity-40"><X size={16} /></button>
          </div>
          <div className="flex items-start gap-2 text-sm text-theme-secondary">
            <ShieldAlert size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-2 min-w-0">
              <p>请只安装可信来源的文件。插件拥有与 Bot 相同的权限，可读写文件、访问网络和账号信息。</p>
              <p>同名插件会被覆盖；已启用的插件会尝试重新加载新代码。</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label htmlFor={confirmation} className="flex items-center gap-2 text-sm text-theme-secondary">
              <input id={confirmation} type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={blocked} className="accent-pink-500" />
              我信任此插件并了解以上操作
            </label>
            <button type="button" onClick={() => { void install() }} disabled={blocked || !confirmed} className="btn-primary ml-auto inline-flex items-center gap-1.5 text-sm">
              {working ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {working ? '正在安装…' : '安装插件'}
            </button>
          </div>
        </>
      ) : <p className="text-xs text-theme-muted">ZIP 顶层需有 package.json；.tgz / .tar.gz 可使用 npm pack 打包。新装插件默认停用。</p>}
    </div>
  )
}

export default LocalInstallPanel
