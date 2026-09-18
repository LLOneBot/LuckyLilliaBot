import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Download } from 'lucide-react'
import { getVideoUrl, downloadImageByUrl } from '../../../utils/webqqApi'
import { showToast } from '../../common'

// 图片预览弹窗组件
export const ImagePreviewModal: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  if (!url) return null

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      // 预览 url 已拼好 rkey; 从 path 末段猜文件名, downloadImageByUrl 会按 blob 类型补扩展名
      const name = new URL(url, location.origin).pathname.split('/').pop() || 'image'
      await downloadImageByUrl(url, name)
    } catch (err) {
      showToast((err as Error).message || '下载失败', 'error')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        onClick={handleDownload}
        title="下载图片"
        className="absolute top-4 right-16 p-2 text-white/80 hover:text-white bg-black/50 rounded-full"
      >
        <Download size={24} />
      </button>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 rounded-full"
      >
        <X size={24} />
      </button>
      <img
        src={url}
        alt="预览"
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  )
}

// 视频预览弹窗组件
export const VideoPreviewModal: React.FC<{ 
  videoInfo: { fileUuid: string; isGroup: boolean } | null
  onClose: () => void 
}> = ({ videoInfo, onClose }) => {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!videoInfo) {
      setUrl(null)
      setError(null)
      return
    }
    
    setLoading(true)
    setError(null)
    getVideoUrl(videoInfo.fileUuid, videoInfo.isGroup)
      .then(setUrl)
      .catch(e => setError(e.message || '获取视频失败'))
      .finally(() => setLoading(false))
  }, [videoInfo])
  
  if (!videoInfo) return null
  
  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 rounded-full z-10"
      >
        <X size={24} />
      </button>
      {loading && (
        <div className="text-white flex items-center gap-2">
          <Loader2 size={24} className="animate-spin" />
          加载中...
        </div>
      )}
      {error && (
        <div className="text-red-400">{error}</div>
      )}
      {url && !loading && (
        <video 
          src={url} 
          controls
          autoPlay
          className="max-w-[90vw] max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>,
    document.body
  )
}
