import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, Upload, FolderPlus, Folder, FileText, Download, Pencil, Trash2, ChevronRight, RefreshCw } from 'lucide-react'
import {
  getGroupFileList, getGroupFileUrl, uploadGroupFile, deleteGroupFile,
  renameGroupFile, createGroupFolder, deleteGroupFolder, renameGroupFolder,
  type GroupFileItem, type GroupFolderItem,
} from '../../../utils/webqqApi'
import { showToast, Portal } from '../../common'

interface GroupFilePanelProps {
  groupCode: string
  onClose: () => void
  // 点击聊天文件卡片打开时的定位目标: 进到 folderId 所在目录并高亮 fileId
  locateTarget?: { folderId: string; fileId: string } | null
}

// 面包屑中的一层目录
interface Crumb {
  folderId: string
  folderName: string
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function formatTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const GroupFilePanel: React.FC<GroupFilePanelProps> = ({ groupCode, onClose, locateTarget }) => {
  const [files, setFiles] = useState<GroupFileItem[]>([])
  const [folders, setFolders] = useState<GroupFolderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // 目录栈: 空 = 根目录. 只有根目录支持新建文件夹 (createGroupFolder 固定建在根)
  const [path, setPath] = useState<Crumb[]>([])
  // 内联弹层: 重命名 / 新建文件夹 的输入态
  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; id: string; busId?: number; oldName: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  // 删除确认弹层的目标 (文件或文件夹)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; busId?: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  // hover tooltip: fixed 定位, 避免被列表 overflow 裁剪. title=完整名, detail=详情行
  const [hoverTip, setHoverTip] = useState<{ title: string; detail: string; x: number; y: number } | null>(null)
  // 从文件卡片定位打开时高亮的文件 (匹配 fileId 或 fileName), 滚动到可见后 2s 清除
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const fileRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const showTip = (e: React.MouseEvent, title: string, detail: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // 收敛右溢出: 泡泡最大宽约 260, 留 8px 边距
    const x = Math.min(rect.left, window.innerWidth - 268)
    setHoverTip({ title, detail, x: Math.max(8, x), y: rect.bottom + 4 })
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentFolderId = path.length > 0 ? path[path.length - 1].folderId : '/'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getGroupFileList(groupCode, currentFolderId)
      setFiles(data.files)
      setFolders(data.folders)
    } catch (e) {
      setError((e as Error).message || '获取群文件失败')
    } finally {
      setLoading(false)
    }
  }, [groupCode, currentFolderId])

  useEffect(() => { load() }, [load])

  // 从文件卡片定位打开: 进到目标文件夹 (子文件夹需从根列表补 folderName) 并标记高亮
  useEffect(() => {
    if (!locateTarget) return
    const { folderId, fileId } = locateTarget
    setHighlightId(fileId)
    if (!folderId || folderId === '/') {
      setPath([])
      return
    }
    // 群文件是扁平两层结构, 子文件夹都在根下: 拉根列表补 folderName
    let cancelled = false
    getGroupFileList(groupCode, '/').then(data => {
      if (cancelled) return
      const folder = data.folders.find(f => f.folderId === folderId)
      setPath([{ folderId, folderName: folder?.folderName || folderId }])
    }).catch(() => {
      if (!cancelled) setPath([{ folderId, folderName: folderId }])
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateTarget?.folderId, locateTarget?.fileId, groupCode])

  // 列表加载完且有高亮目标: 滚动到该文件行, 2s 后清除高亮
  useEffect(() => {
    if (!highlightId || loading) return
    const matched = files.find(f => f.fileId === highlightId || f.fileName === highlightId)
    if (!matched) return
    const el = fileRowRefs.current.get(matched.fileId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(timer)
  }, [highlightId, files, loading])

  const enterFolder = (folder: GroupFolderItem) => {
    setPath(prev => [...prev, { folderId: folder.folderId, folderName: folder.folderName }])
  }

  // 跳到面包屑指定层 (index = -1 表示根目录)
  const goToCrumb = (index: number) => {
    setPath(prev => prev.slice(0, index + 1))
  }

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024 * 1024) {
      showToast('文件过大，最大支持 2GB', 'error')
      return
    }
    setUploading(true)
    showToast(`正在上传 ${file.name}...`, 'warning')
    try {
      await uploadGroupFile(groupCode, file, currentFolderId)
      showToast('上传成功', 'success')
      load()
    } catch (err) {
      showToast(`${(err as Error).message || '上传失败'}，可能该群不允许上传群文件`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (file: GroupFileItem) => {
    try {
      const url = await getGroupFileUrl(groupCode, file.fileId)
      window.open(url, '_blank')
    } catch (err) {
      showToast((err as Error).message || '获取下载链接失败', 'error')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'file') {
        await deleteGroupFile(groupCode, deleteTarget.id, deleteTarget.busId!)
      } else {
        await deleteGroupFolder(groupCode, deleteTarget.id)
      }
      showToast('已删除', 'success')
      setDeleteTarget(null)
      load()
    } catch (err) {
      showToast((err as Error).message || '删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const openRename = (type: 'file' | 'folder', id: string, oldName: string, busId?: number) => {
    setRenameTarget({ type, id, oldName, busId })
    setRenameValue(oldName)
  }

  const submitRename = async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name || name === renameTarget.oldName) { setRenameTarget(null); return }
    try {
      if (renameTarget.type === 'file') {
        await renameGroupFile(groupCode, renameTarget.id, currentFolderId, name)
      } else {
        await renameGroupFolder(groupCode, renameTarget.id, name)
      }
      showToast('已重命名', 'success')
      setRenameTarget(null)
      load()
    } catch (err) {
      showToast((err as Error).message || '重命名失败', 'error')
    }
  }

  const submitCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); return }
    try {
      await createGroupFolder(groupCode, name)
      showToast('文件夹已创建', 'success')
      setCreatingFolder(false)
      setNewFolderName('')
      load()
    } catch (err) {
      showToast((err as Error).message || '新建文件夹失败', 'error')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
        <div className="font-medium text-theme">群文件</div>
        <div className="flex items-center gap-1">
          <button onClick={load} title="刷新" className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded-lg transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={onClose} className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-divider">
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm gradient-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          上传
        </button>
        {/* createGroupFolder 固定在根目录创建, 故只有根目录显示新建文件夹 */}
        {path.length === 0 && (
          <button
            onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-theme-item hover:bg-theme-item-hover text-theme rounded-lg transition-colors"
          >
            <FolderPlus size={15} />
            新建文件夹
          </button>
        )}
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
      </div>

      {/* 面包屑 */}
      <div className="flex items-center flex-wrap gap-0.5 px-3 py-2 text-sm text-theme-hint border-b border-theme-divider">
        <button onClick={() => goToCrumb(-1)} className={`hover:text-pink-500 transition-colors ${path.length === 0 ? 'text-theme font-medium' : ''}`}>
          全部文件
        </button>
        {path.map((crumb, i) => (
          <React.Fragment key={crumb.folderId}>
            <ChevronRight size={14} className="text-theme-hint/60" />
            <button
              onClick={() => goToCrumb(i)}
              className={`hover:text-pink-500 transition-colors truncate max-w-[120px] ${i === path.length - 1 ? 'text-theme font-medium' : ''}`}
            >
              {crumb.folderName}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* 新建文件夹输入行 */}
      {creatingFolder && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-divider bg-theme-item/40">
          <Folder size={16} className="text-yellow-500 flex-shrink-0" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreateFolder(); if (e.key === 'Escape') setCreatingFolder(false) }}
            placeholder="文件夹名称"
            className="flex-1 min-w-0 px-2 py-1 text-sm bg-theme-input border border-theme-input rounded focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme"
          />
          <button onClick={submitCreateFolder} className="text-sm text-pink-500 hover:text-pink-600">确定</button>
          <button onClick={() => setCreatingFolder(false)} className="text-sm text-theme-hint hover:text-theme">取消</button>
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-pink-500" /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={load} className="text-sm text-pink-500 hover:text-pink-600">重试</button>
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-theme-hint text-sm">此目录暂无文件</div>
        ) : (
          <div className="py-1">
            {/* 文件夹在前 */}
            {folders.map(folder => (
              <div key={folder.folderId} className="group flex items-center gap-3 px-3 py-2 hover:bg-theme-item-hover transition-colors">
                <button onClick={() => enterFolder(folder)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <Folder size={20} className="text-yellow-500 flex-shrink-0" />
                  <div
                    className="flex-1 min-w-0"
                    onMouseEnter={(e) => showTip(e, folder.folderName, `${folder.fileCount} 个文件 · ${folder.creatorName}`)}
                    onMouseLeave={() => setHoverTip(null)}
                  >
                    <div className="text-sm text-theme truncate">{folder.folderName}</div>
                    <div className="text-xs text-theme-hint truncate">{folder.fileCount} 个文件 · {folder.creatorName}</div>
                  </div>
                </button>
                {/* 手机常显; 桌面默认 hidden 不占位(文本显示全), hover 才 flex 占位, 文本被挤短 truncate 腾空间 */}
                <div className="flex md:hidden md:group-hover:flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => openRename('folder', folder.folderId, folder.folderName)} title="重命名" className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'folder', id: folder.folderId, name: folder.folderName })} title="删除" className="p-1.5 text-theme-hint hover:text-red-500 hover:bg-theme-item rounded transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {/* 文件在后 */}
            {files.map(file => {
              const detail = `${formatSize(file.fileSize)} · ${file.uploaderName || ''}${file.uploadTime ? ` · ${formatTime(file.uploadTime)}` : ''}`
              const highlighted = highlightId != null && (file.fileId === highlightId || file.fileName === highlightId)
              return (
              <div
                key={file.fileId}
                ref={(el) => { if (el) fileRowRefs.current.set(file.fileId, el); else fileRowRefs.current.delete(file.fileId) }}
                className={`group flex items-center gap-3 px-3 py-2 transition-colors ${highlighted ? 'bg-pink-500/10 ring-1 ring-inset ring-pink-500/60' : 'hover:bg-theme-item-hover'}`}
              >
                <FileText size={20} className="text-blue-400 flex-shrink-0" />
                <div
                  className="flex-1 min-w-0"
                  onMouseEnter={(e) => showTip(e, file.fileName, detail)}
                  onMouseLeave={() => setHoverTip(null)}
                >
                  <div className="text-sm text-theme truncate">{file.fileName}</div>
                  <div className="text-xs text-theme-hint truncate">{detail}</div>
                </div>
                {/* 手机常显; 桌面默认 hidden 不占位(文本显示全), hover 才 flex 占位, 文本被挤短 truncate 腾空间 */}
                <div className="flex md:hidden md:group-hover:flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => handleDownload(file)} title="下载" className="p-1.5 text-theme-hint hover:text-pink-500 hover:bg-theme-item rounded transition-colors">
                    <Download size={14} />
                  </button>
                  <button onClick={() => openRename('file', file.fileId, file.fileName, file.busId)} title="重命名" className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'file', id: file.fileId, busId: file.busId, name: file.fileName })} title="删除" className="p-1.5 text-theme-hint hover:text-red-500 hover:bg-theme-item rounded transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 重命名弹层 */}
      {renameTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-xl border border-theme w-80 max-w-[90vw]">
            <div className="font-medium text-theme mb-3">重命名{renameTarget.type === 'folder' ? '文件夹' : '文件'}</div>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenameTarget(null) }}
              className="w-full px-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRenameTarget(null)} className="px-4 py-1.5 text-sm text-theme-hint hover:text-theme transition-colors">取消</button>
              <button onClick={submitRename} className="px-4 py-1.5 text-sm gradient-primary text-white rounded-lg transition-all">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹层 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-xl border border-theme w-80 max-w-[90vw]">
            <div className="font-medium text-theme mb-2">删除{deleteTarget.type === 'folder' ? '文件夹' : '文件'}</div>
            <div className="text-sm text-theme-secondary mb-4 break-all">
              确定删除{deleteTarget.type === 'folder' ? '文件夹' : '文件'}「{deleteTarget.name}」
              {deleteTarget.type === 'folder' ? '及其中所有文件？' : '？'}此操作不可撤销。
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-1.5 text-sm text-theme-hint hover:text-theme transition-colors disabled:opacity-50">取消</button>
              <button onClick={confirmDelete} disabled={deleting} className="px-4 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                {deleting && <Loader2 size={14} className="animate-spin" />}删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* hover tooltip 泡泡: Portal 到 body 脱离面板的 backdrop-blur (否则 fixed 会相对该容器而非视口); pointer-events-none 不挡鼠标 */}
      {hoverTip && (
        <Portal>
          <div
            className="fixed z-[100] pointer-events-none max-w-[260px] px-3 py-2 rounded-lg bg-white dark:bg-neutral-800 shadow-xl border border-theme"
            style={{ left: hoverTip.x, top: hoverTip.y }}
          >
            <div className="text-sm text-theme break-all">{hoverTip.title}</div>
            <div className="text-xs text-theme-secondary break-all mt-0.5">{hoverTip.detail}</div>
          </div>
        </Portal>
      )}
    </div>
  )
}

export default GroupFilePanel
