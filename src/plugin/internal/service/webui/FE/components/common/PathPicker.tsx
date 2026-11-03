import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CornerLeftUp, File, Folder, FolderOpen, HardDrive, House, LoaderCircle, Search, X } from 'lucide-react'
import Portal from './Portal'
import { apiFetch } from '../../utils/api'

interface FsEntry {
  name: string
  path: string
  dir: boolean
}

/** GET /api/fs/list, see BE/routes/files.ts */
interface FsListing {
  path: string
  parent: string | null
  entries: FsEntry[]
  truncated: boolean
  /** Asked for once, as the browser opens */
  roots?: { name: string; path: string }[]
  home: string
}

export interface PathPickerProps {
  value: string
  onChange(value: string): void
  /** A file (the default) or a directory */
  select?: 'file' | 'directory'
  /** Extensions of the files listed, e.g. ['.exe']; the others show on request */
  accept?: string[]
  /** Where the browser opens while there is no value, e.g. what is used without one */
  start?: string
  placeholder?: string
  disabled?: boolean
  /** The browser's title */
  title?: string
}

/**
 * A path on the machine the bot runs on, typed or picked in a browser of its directories: the WebUI may be open on
 * another machine, so the browser's own file dialog would pick the wrong one.
 */
export const PathPicker: React.FC<PathPickerProps> = ({ value, onChange, select = 'file', accept, start, placeholder, disabled, title }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <input
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
          className={`input-field ${value && !disabled ? 'pr-10' : ''}`}
        />
        {value && !disabled && (
          <button
            type="button"
            title="清空"
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-theme-hint hover:text-theme transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="btn-glass text-sm flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FolderOpen size={16} />
        浏览
      </button>
      {open && (
        <PathBrowser
          initial={value || start || ''}
          select={select}
          accept={accept}
          title={title ?? (select === 'directory' ? '选择文件夹' : '选择文件')}
          onPick={path => {
            onChange(path)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

interface PathBrowserProps {
  /** A directory to open, or a file to open the directory of with it selected; empty: the home directory */
  initial: string
  select: 'file' | 'directory'
  accept?: string[]
  title: string
  onPick(path: string): void
  onClose(): void
}

const hidden = (name: string) => name.startsWith('.') || name.startsWith('$')

const PathBrowser: React.FC<PathBrowserProps> = ({ initial, select, accept, title, onPick, onClose }) => {
  const [listing, setListing] = useState<FsListing | null>(null)
  const [roots, setRoots] = useState<NonNullable<FsListing['roots']>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [allFiles, setAllFiles] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const request = useRef(0)

  const go = useCallback(async (target: string, file?: string, withRoots = false) => {
    const id = ++request.current
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch<FsListing>(`/api/fs/list?path=${encodeURIComponent(target)}${withRoots ? '&roots=1' : ''}`)
      if (id !== request.current) return
      if (res.data.roots) setRoots(res.data.roots)
      setListing(res.data)
      setTyped(res.data.path)
      setFilter('')
      setSelected(file && res.data.entries.some(entry => !entry.dir && entry.path === file) ? file : null)
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    go(initial, initial, true)
  }, [go, initial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const extensions = accept?.map(ext => ext.toLowerCase())
  const matches = (entry: FsEntry) => entry.dir || allFiles || !extensions?.length || extensions.some(ext => entry.name.toLowerCase().endsWith(ext))
  const needle = filter.trim().toLowerCase()
  const entries = (listing?.entries ?? []).filter(entry =>
    (select === 'file' || entry.dir)
    && (showHidden || !hidden(entry.name))
    && matches(entry)
    && (!needle || entry.name.toLowerCase().includes(needle)))
  const chosen = select === 'directory' ? listing?.path : selected

  return (
    <Portal>
      <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 10000 }} onClick={onClose}>
        <div className="glass glass-thick r-window glass-pop w-full max-w-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-lg font-semibold text-theme">{title}</h3>
            <button type="button" onClick={onClose} className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="px-6 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="上一级"
                disabled={!listing?.parent}
                onClick={() => listing?.parent && go(listing.parent)}
                className="btn-glass p-2 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CornerLeftUp size={16} />
              </button>
              <button type="button" title="主目录" disabled={!listing} onClick={() => listing && go(listing.home)} className="btn-glass p-2 flex-shrink-0 disabled:opacity-40">
                <House size={16} />
              </button>
              <input
                value={typed}
                spellCheck={false}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && go(typed, typed)}
                className="input-field flex-1 min-w-0 font-mono text-sm"
              />
            </div>
            {listing && roots.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {roots.map(root => (
                  <button
                    key={root.path}
                    type="button"
                    onClick={() => go(root.path)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors ${listing.path.toLowerCase().startsWith(root.path.toLowerCase())
                      ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-500'
                      : 'bg-theme-item text-theme-secondary hover:bg-theme-item-hover'}`}
                  >
                    <HardDrive size={12} />
                    {root.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[10rem]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint" />
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="在这个文件夹里筛选" className="input-field pl-8 py-1.5 text-sm" />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-theme-secondary cursor-pointer select-none">
                <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
                显示隐藏项
              </label>
              {select === 'file' && !!extensions?.length && (
                <label className="flex items-center gap-1.5 text-xs text-theme-secondary cursor-pointer select-none">
                  <input type="checkbox" checked={allFiles} onChange={e => setAllFiles(e.target.checked)} />
                  显示所有文件（不只 {extensions.join(' ')}）
                </label>
              )}
            </div>
          </div>

          <div className="mx-6 mt-3 rounded-xl border border-theme-divider overflow-y-auto min-h-[16rem] flex-1">
            {loading && !listing ? (
              <div className="flex justify-center py-16"><LoaderCircle size={28} className="animate-spin text-pink-500" /></div>
            ) : error ? (
              <p className="p-4 text-sm text-red-500">{error}</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-sm text-theme-muted">{needle ? '没有名字里带这些字的项' : '这个文件夹是空的'}</p>
            ) : (
              <ul className={loading ? 'opacity-60' : ''}>
                {entries.map(entry => {
                  const active = !entry.dir && entry.path === selected
                  const Icon = entry.dir ? Folder : File
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        onClick={() => (entry.dir ? go(entry.path) : setSelected(entry.path))}
                        onDoubleClick={() => !entry.dir && onPick(entry.path)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${active
                          ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-500'
                          : 'text-theme hover:bg-theme-item'}`}
                      >
                        <Icon size={16} className={active ? 'text-pink-500' : entry.dir ? 'text-amber-500' : 'text-theme-muted'} />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {listing?.truncated && <p className="px-6 pt-2 text-xs text-theme-muted">这个文件夹里的项太多，只列出了前一部分，可以筛选或直接在上面输入路径</p>}

          <div className="flex items-center gap-3 p-6 pt-4">
            <span className="flex-1 min-w-0 truncate text-xs text-theme-muted font-mono" title={chosen ?? undefined}>
              {chosen ?? (select === 'file' ? '点一个文件选中它，双击直接选用' : '')}
            </span>
            <button type="button" onClick={onClose} className="px-5 py-2 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors">取消</button>
            <button type="button" disabled={!chosen} onClick={() => chosen && onPick(chosen)} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {select === 'directory' ? '选择这个文件夹' : '选择'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
