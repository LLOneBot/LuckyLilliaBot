import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileArchive, FolderOpen, Loader2, ShieldAlert } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

interface Props {
  busy: boolean
  disabled: boolean
  onInstall(file: File): void
}

const LocalInstallButton: React.FC<Props> = ({ busy, disabled, onInstall }) => {
  const ctx = usePluginContext()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".zip,.tgz,.tar.gz"
        aria-label="选择本地插件压缩包"
        className="hidden"
        disabled={disabled || busy}
        onChange={event => {
          const selected = event.currentTarget.files?.[0]
          // Selecting the same archive again must also work after canceling or a failed install.
          event.currentTarget.value = ''
          if (!selected) return
          if (!/\.(zip|tgz|tar\.gz)$/i.test(selected.name)) {
            ctx.toast('请选择 ZIP 或 npm 格式的 .tgz / .tar.gz 插件包', 'error')
          } else if (!selected.size) {
            ctx.toast('插件压缩包不能为空', 'error')
          } else {
            setFile(selected)
          }
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || busy}
        className="btn-glass ml-auto flex shrink-0 items-center gap-1.5 text-sm"
        title="支持 ZIP、.tgz 和 .tar.gz"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
        {busy ? '正在安装…' : '从本地安装'}
      </button>
      {file && (
        <LocalInstallDialog
          file={file}
          disabled={disabled || busy}
          onCancel={() => setFile(null)}
          onConfirm={() => { setFile(null); onInstall(file) }}
        />
      )}
    </>
  )
}

const LocalInstallDialog: React.FC<{ file: File; disabled: boolean; onConfirm(): void; onCancel(): void }> = ({ file, disabled, onConfirm, onCancel }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  const description = useId()
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])

  return createPortal(
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={title}
      aria-describedby={description}
      className="r-window m-auto max-w-lg overflow-y-auto border-0 bg-transparent p-0 text-theme backdrop:bg-black/40"
      style={{ width: 'calc(100% - 2rem)', maxHeight: 'calc(100dvh - 2rem)' }}
      onCancel={event => { event.preventDefault(); onCancel() }}
      onClick={event => { if (event.target === event.currentTarget) onCancel() }}
    >
      <div className="glass glass-thick r-window glass-pop">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <ShieldAlert size={20} />
            </div>
            <h3 id={title} className="text-lg font-semibold">从本地安装插件？</h3>
          </div>
          <div className="rounded-xl bg-theme-item p-3 flex items-start gap-2 text-sm">
            <FileArchive size={18} className="shrink-0 mt-0.5 text-theme-muted" />
            <div className="min-w-0">
              <div className="break-all">{file.name}</div>
              <div className="text-xs text-theme-muted mt-1">{file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KiB` : `${(file.size / 1024 / 1024).toFixed(2)} MiB`}</div>
            </div>
          </div>
          <div id={description} className="space-y-3 text-sm text-theme-secondary">
            <p>本地插件包未经过插件市场目录的收录校验，请只安装来源可信的文件。</p>
            <p>插件运行后拥有与 Bot 相同的权限，可以读取账号信息、收发消息、读写文件和访问网络。恶意插件可能窃取数据或破坏系统。</p>
            <p className="text-amber-700 dark:text-amber-400">如果包名与已安装的插件相同，会覆盖原插件；如果它已启用，安装后会尝试重新加载并执行新代码。</p>
          </div>
          <p className="text-xs text-theme-muted">ZIP 顶层需包含 package.json；npm 包支持 .tgz / .tar.gz。新装插件默认停用，安装后请到「插件列表」启用。</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 p-6 hairline-t">
          <button type="button" autoFocus onClick={onCancel} className="btn-glass">取消</button>
          <button type="button" disabled={disabled} onClick={onConfirm} className="btn-primary">我了解风险，继续安装</button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

export default LocalInstallButton
