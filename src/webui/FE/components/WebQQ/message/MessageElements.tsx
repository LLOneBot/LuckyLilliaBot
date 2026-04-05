import React, { useState, memo, useRef } from 'react'
import { Loader2, Mic, Play, Pause, ChevronRight, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { MessageElement, RawMessage } from '../../../types/webqq'
import { getToken } from '../../../utils/api'
import { translatePttToText, getAudioProxyUrl, getForwardMessages } from '../../../utils/webqqApi'
import type { ForwardMessageItem, ForwardMessageSegment } from '../../../utils/webqqApi'

// 图片预览上下文
export const ImagePreviewContext = React.createContext<{
  showPreview: (url: string) => void
} | null>(null)

// 视频预览上下文
export const VideoPreviewContext = React.createContext<{
  showPreview: (chatType: number, peerUid: string, msgId: string, elementId: string) => void
} | null>(null)

// 图片右键菜单上下文（用于添加到表情）
export const ImageContextMenuContext = React.createContext<{
  showMenu: (e: React.MouseEvent, message: RawMessage, elementId: string) => void
} | null>(null)

export const getProxyImageUrl = (url: string | undefined): string => {
  if (!url) return ''
  if (url.startsWith('blob:')) return url
  if (url.includes('qpic.cn') || url.includes('multimedia.nt.qq.com.cn')) {
    return `/api/webqq/image-proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(getToken() || '')}`
  }
  return url
}

export const MessageElementRenderer = memo<{ element: MessageElement; message?: RawMessage }>(({ element, message }) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [videoThumbLoaded, setVideoThumbLoaded] = useState(false)
  const [videoThumbError, setVideoThumbError] = useState(false)
  const previewContext = React.useContext(ImagePreviewContext)
  const videoPreviewContext = React.useContext(VideoPreviewContext)
  const imageContextMenuContext = React.useContext(ImageContextMenuContext)

  if (element.textElement) return <span className="whitespace-pre-wrap break-all" style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{element.textElement.content}</span>
  if (element.picElement) {
    const pic = element.picElement
    let url = pic.originImageUrl ? (pic.originImageUrl.startsWith('http') ? pic.originImageUrl : `https://gchat.qpic.cn${pic.originImageUrl}`) : ''
    const proxyUrl = getProxyImageUrl(url)

    const maxHeight = 200
    const maxWidth = 300
    let displayWidth = pic.picWidth || 200
    let displayHeight = pic.picHeight || 200

    if (displayHeight > maxHeight) {
      displayWidth = (displayWidth * maxHeight) / displayHeight
      displayHeight = maxHeight
    }
    if (displayWidth > maxWidth) {
      displayHeight = (displayHeight * maxWidth) / displayWidth
      displayWidth = maxWidth
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      if (!message) return
      e.preventDefault()
      e.stopPropagation()
      imageContextMenuContext?.showMenu(e, message, element.elementId)
    }

    return (
      <div
        className="relative rounded-lg overflow-hidden bg-theme-item cursor-pointer"
        style={{ width: displayWidth, height: displayHeight }}
        onClick={() => previewContext?.showPreview(proxyUrl)}
        onContextMenu={handleContextMenu}
      >
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center text-theme-hint">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center text-theme-hint text-xs">
            图片加载失败
          </div>
        )}
        <img
          src={proxyUrl}
          alt="图片"
          loading="lazy"
          className={`w-full h-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      </div>
    )
  }
  if (element.faceElement) {
    const faceId = element.faceElement.faceIndex
    const faceText = element.faceElement.faceText
    return (
      <img
        src={`/face/${faceId}.png`}
        alt={faceText || `[表情${faceId}]`}
        title={faceText || `表情${faceId}`}
        className="inline-block align-text-bottom"
        style={{ width: 24, height: 24 }}
        onError={(e) => {
          // 如果图片加载失败，显示文字
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const span = document.createElement('span')
          span.textContent = faceText || `[表情${faceId}]`
          target.parentNode?.insertBefore(span, target)
        }}
      />
    )
  }
  if (element.fileElement) return <span>[文件: {element.fileElement.fileName}]</span>
  if (element.pttElement) {
    return <PttElementRenderer element={element} message={message} />
  }
  if (element.videoElement) {
    const video = element.videoElement
    const maxHeight = 200
    const maxWidth = 300
    let displayWidth = video.thumbWidth || 200
    let displayHeight = video.thumbHeight || 150

    if (displayHeight > maxHeight) {
      displayWidth = (displayWidth * maxHeight) / displayHeight
      displayHeight = maxHeight
    }
    if (displayWidth > maxWidth) {
      displayHeight = (displayHeight * maxWidth) / displayWidth
      displayWidth = maxWidth
    }

    let thumbUrl = ''
    if (video.thumbPath) {
      let firstThumb: string | undefined
      if (video.thumbPath instanceof Map) {
        firstThumb = video.thumbPath.values().next().value
      } else if (typeof video.thumbPath === 'object') {
        const values = Object.values(video.thumbPath as Record<string, string>)
        firstThumb = values[0]
      }
      if (firstThumb) {
        thumbUrl = `/api/webqq/file-proxy?path=${encodeURIComponent(firstThumb)}&token=${encodeURIComponent(getToken() || '')}`
      }
    }

    const duration = video.fileTime || 0
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

    const handleClick = () => {
      if (message && element.elementId) {
        videoPreviewContext?.showPreview(message.chatType, message.peerUid, message.msgId, element.elementId)
      }
    }

    return (
      <div
        className="relative rounded-lg overflow-hidden bg-theme-item cursor-pointer group"
        style={{ width: displayWidth, height: displayHeight }}
        onClick={handleClick}
      >
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700" />

        {thumbUrl ? (
          <>
            {!videoThumbLoaded && !videoThumbError && (
              <div className="absolute inset-0 flex items-center justify-center text-theme-hint">
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}
            <img
              src={thumbUrl}
              alt="视频缩略图"
              loading="lazy"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity ${videoThumbLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setVideoThumbLoaded(true)}
              onError={() => setVideoThumbError(true)}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-theme-hint text-xs">
            视频
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
            <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-white border-b-8 border-b-transparent ml-1"
                 style={{ borderLeftWidth: '14px' }} />
          </div>
        </div>
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-white text-xs">
          {durationStr}
        </div>
      </div>
    )
  }
  if (element.grayTipElement) {
    const grayTip = element.grayTipElement
    if (grayTip.jsonGrayTipElement?.jsonStr) {
      try {
        const json = JSON.parse(grayTip.jsonGrayTipElement.jsonStr)
        if (json.items) {
          const text = json.items.map((item: any) => item.txt || '').join('')
          return <span className="text-theme-hint text-xs">{text || '[戳一戳]'}</span>
        }
      } catch {
        // ignore
      }
    }
    return <span className="text-theme-hint text-xs">[系统提示]</span>
  }
  if (element.multiForwardMsgElement) {
    return <ForwardMsgElementRenderer element={element} />
  }
  if (element.arkElement) {
    try {
      const arkData = JSON.parse(element.arkElement.bytesData)
      if (arkData.app === 'com.tencent.multimsg' && arkData.meta?.detail?.resid) {
        return <ArkForwardMsgRenderer arkData={arkData} />
      }
    } catch { /* ignore */ }
    return <span>[卡片消息]</span>
  }
  if (element.marketFaceElement) {
    const { emojiId, faceName, supportSize } = element.marketFaceElement
    const { width = 200, height = 200 } = supportSize?.[0] ?? {}
    const dir = emojiId.substring(0, 2)
    const url = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw${Math.min(width, 300)}.gif`
    return (
      <img
        src={url}
        alt={faceName || '[表情包]'}
        title={faceName}
        className="inline-block align-text-bottom rounded"
        style={{ maxWidth: Math.min(width, 200), maxHeight: Math.min(height, 200) }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const span = document.createElement('span')
          span.textContent = `[${faceName || '表情包'}]`
          target.parentNode?.insertBefore(span, target)
        }}
      />
    )
  }
  return null
})

// 检查元素是否有有效内容
export const hasValidContent = (element: MessageElement): boolean => {
  return !!(
    element.textElement ||
    element.picElement ||
    element.fileElement ||
    element.pttElement ||
    element.videoElement ||
    element.faceElement ||
    element.grayTipElement ||
    element.arkElement ||
    element.marketFaceElement ||
    element.multiForwardMsgElement
  )
}

// 检查消息是否是系统提示（如戳一戳）
export const isSystemTipMessage = (message: RawMessage): boolean => {
  if (!message.elements || message.elements.length === 0) return false
  return message.elements.every(el => el.grayTipElement || el.replyElement)
}

// 语音消息渲染组件
const PttElementRenderer: React.FC<{ element: MessageElement; message?: RawMessage }> = ({ element, message }) => {
  const [transcribedText, setTranscribedText] = useState<string | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const ptt = element.pttElement!
  const duration = ptt.duration || 0
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  const durationStr = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}"`

  // 如果已经有转换好的文字，直接显示
  const existingText = ptt.text

  // 计算语音条宽度（根据时长，最小80px，最大200px）
  const minWidth = 80
  const maxWidth = 200
  const width = Math.min(maxWidth, Math.max(minWidth, minWidth + duration * 3))

  const handlePlay = async () => {
    if (!message || !ptt.fileUuid || isLoading) return

    // 如果正在播放，暂停
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    // 如果已有 audio 元素且已加载，直接播放
    if (audioRef.current && audioRef.current.readyState >= 2) {
      audioRef.current.play()
      setIsPlaying(true)
      return
    }

    // 通过代理获取音频
    setIsLoading(true)
    try {
      const isGroup = message.chatType === 2
      console.log('pttElement:', ptt)
      const url = getAudioProxyUrl(ptt.fileUuid, isGroup, ptt.filePath)
      console.log('音频代理URL:', url)

      const audio = new Audio()
      audioRef.current = audio

      audio.onended = () => setIsPlaying(false)
      audio.onerror = (e) => {
        // 尝试获取响应内容来诊断问题
        fetch(url).then(r => r.text()).then(text => {
          console.error('音频加载错误，响应内容:', text.substring(0, 200))
        }).catch(() => {})
        console.error('音频加载错误:', e, audio.error, 'URL:', url)
        setIsPlaying(false)
        setIsLoading(false)
      }

      audio.onloadeddata = async () => {
        setIsLoading(false)
        try {
          await audio.play()
          setIsPlaying(true)
        } catch (e) {
          console.error('播放失败:', e)
        }
      }

      audio.src = url
    } catch (e) {
      console.error('获取语音URL失败:', e)
      setIsLoading(false)
    }
  }

  const handleTranscribe = async () => {
    if (!message || isTranscribing || transcribedText !== null) return

    setIsTranscribing(true)
    setTranscribeError(false)

    try {
      const text = await translatePttToText(message.msgId, message.chatType, message.peerUid, element)
      setTranscribedText(text || '(无法识别)')
    } catch (e) {
      console.error('语音转文字失败:', e)
      setTranscribeError(true)
      setTranscribedText('转换失败')
    } finally {
      setIsTranscribing(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* 语音条 */}
        <div
          className="flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/40 rounded-full cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
          style={{ width }}
          onClick={handlePlay}
          title="点击播放"
        >
          {isLoading ? (
            <Loader2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0 animate-spin" />
          ) : isPlaying ? (
            <Pause size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          ) : (
            <Play size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          )}
          <div className="flex-1 flex items-center gap-0.5">
            {/* 波形动画 */}
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`w-0.5 bg-green-400 dark:bg-green-500 rounded-full transition-all ${isPlaying ? 'animate-pulse' : ''}`}
                style={{ height: `${8 + Math.random() * 8}px` }}
              />
            ))}
          </div>
          <span className="text-xs text-green-700 dark:text-green-300 flex-shrink-0">{durationStr}</span>
        </div>

        {/* 转文字按钮 */}
        {!existingText && transcribedText === null && (
          <button
            onClick={handleTranscribe}
            disabled={isTranscribing}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
            title="语音转文字"
          >
            {isTranscribing ? <Loader2 size={12} className="animate-spin" /> : '文'}
          </button>
        )}
      </div>

      {/* 转换后的文字 */}
      {(existingText || transcribedText) && (
        <div className={`text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg max-w-[250px] ${transcribeError ? 'text-red-500' : 'text-theme-secondary'}`}>
          {existingText || transcribedText}
        </div>
      )}
    </div>
  )
}

// 合并转发消息内容渲染（用于弹窗内显示）
const ForwardSegmentRenderer: React.FC<{ segment: ForwardMessageSegment }> = ({ segment }) => {
  const previewContext = React.useContext(ImagePreviewContext)

  if (segment.type === 'text' && segment.data.text) {
    return <span className="whitespace-pre-wrap break-all" style={{ overflowWrap: 'anywhere' }}>{segment.data.text}</span>
  }
  if (segment.type === 'image' && segment.data.url) {
    const proxyUrl = getProxyImageUrl(segment.data.url)
    return (
      <img
        src={proxyUrl}
        alt="图片"
        loading="lazy"
        className="max-w-[200px] max-h-[150px] rounded-lg cursor-pointer object-cover"
        onClick={() => previewContext?.showPreview(proxyUrl)}
      />
    )
  }
  if (segment.type === 'face' && segment.data.faceId !== undefined) {
    return (
      <img
        src={`/face/${segment.data.faceId}.png`}
        alt={`[表情${segment.data.faceId}]`}
        className="inline-block align-text-bottom"
        style={{ width: 24, height: 24 }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const span = document.createElement('span')
          span.textContent = `[表情${segment.data.faceId}]`
          target.parentNode?.insertBefore(span, target)
        }}
      />
    )
  }
  if (segment.type === 'forward' && segment.data.resId) {
    return <NestedForwardCard resId={segment.data.resId} title={segment.data.title || '[聊天记录]'} />
  }
  return null
}

// 嵌套合并转发卡片（递归支持）
const NestedForwardCard: React.FC<{ resId: string; title: string }> = ({ resId, title }) => {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        onClick={() => setShowModal(true)}
      >
        <span className="text-sm text-theme-secondary">{title}</span>
        <ChevronRight size={14} className="text-theme-hint flex-shrink-0" />
      </div>
      {showModal && <ForwardMsgModal resId={resId} title={title} onClose={() => setShowModal(false)} />}
    </>
  )
}

// 解析 xmlContent 中的预览信息
function parseForwardXml(xmlContent: string): { title: string; previews: string[]; summary: string } {
  const title = xmlContent.match(/<title[^>]*color="#000000"[^>]*>(.*?)<\/title>/)?.[1] || '[聊天记录]'
  const previewMatches = xmlContent.match(/<title[^>]*color="#777777"[^>]*>(.*?)<\/title>/g)
  const previews = previewMatches?.map(m => m.replace(/<[^>]+>/g, '')) || []
  const summary = xmlContent.match(/<summary[^>]*>(.*?)<\/summary>/)?.[1] || ''
  return { title, previews, summary }
}

// 合并转发消息卡片渲染器
const ForwardMsgElementRenderer: React.FC<{ element: MessageElement }> = ({ element }) => {
  const [showModal, setShowModal] = useState(false)
  const forward = element.multiForwardMsgElement!
  const { title, previews, summary } = parseForwardXml(forward.xmlContent)

  return (
    <>
      <div
        className="w-[240px] bg-gray-50 dark:bg-gray-800/80 rounded-lg overflow-hidden cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors border border-theme-divider"
        onClick={() => setShowModal(true)}
      >
        <div className="px-3 pt-2.5 pb-1">
          <div className="text-sm font-medium text-theme mb-1.5">{title}</div>
          {previews.map((preview, i) => (
            <div key={i} className="text-xs text-theme-secondary truncate leading-5">{preview}</div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-theme-divider">
          <span className="text-xs text-theme-hint">{summary}</span>
          <ChevronRight size={12} className="text-theme-hint" />
        </div>
      </div>
      {showModal && <ForwardMsgModal resId={forward.resId} title={title} onClose={() => setShowModal(false)} />}
    </>
  )
}

// Ark 格式的合并转发消息渲染器（自己发出的转发消息）
const ArkForwardMsgRenderer: React.FC<{ arkData: any }> = ({ arkData }) => {
  const [showModal, setShowModal] = useState(false)
  const detail = arkData.meta?.detail || {}
  const title = detail.source || '[聊天记录]'
  const previews: string[] = (detail.news || []).map((n: any) => n.text || '')
  const summary = detail.summary || ''
  const resId = detail.resid || ''

  return (
    <>
      <div
        className="w-[240px] bg-gray-50 dark:bg-gray-800/80 rounded-lg overflow-hidden cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors border border-theme-divider"
        onClick={() => setShowModal(true)}
      >
        <div className="px-3 pt-2.5 pb-1">
          <div className="text-sm font-medium text-theme mb-1.5">{title}</div>
          {previews.map((preview, i) => (
            <div key={i} className="text-xs text-theme-secondary truncate leading-5">{preview}</div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-theme-divider">
          <span className="text-xs text-theme-hint">{summary}</span>
          <ChevronRight size={12} className="text-theme-hint" />
        </div>
      </div>
      {showModal && <ForwardMsgModal resId={resId} title={title} onClose={() => setShowModal(false)} />}
    </>
  )
}

// 合并转发消息弹窗
const ForwardMsgModal: React.FC<{ resId: string; title: string; onClose: () => void }> = ({ resId, title, onClose }) => {
  const [messages, setMessages] = useState<ForwardMessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getForwardMessages(resId)
        if (!cancelled) setMessages(data)
      } catch (e) {
        if (!cancelled) setError(e.message || '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [resId])

  const formatTime = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-[90vw] max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider flex-shrink-0">
          <span className="font-medium text-theme">{title}</span>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} className="text-theme-hint" />
          </button>
        </div>
        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-pink-500" />
            </div>
          )}
          {error && (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          )}
          {!loading && !error && messages.length === 0 && (
            <div className="text-center py-8 text-theme-hint text-sm">暂无消息</div>
          )}
          {!loading && !error && messages.map((msg, i) => (
            <div key={i} className="flex gap-2">
              <img
                src={`https://q1.qlogo.cn/g?b=qq&nk=${msg.senderUin}&s=640`}
                alt={msg.senderName}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-theme-secondary">{msg.senderName}</span>
                  <span className="text-xs text-theme-hint">{formatTime(msg.time)}</span>
                </div>
                <div className="text-sm text-theme break-words">
                  {msg.segments.map((seg, j) => <ForwardSegmentRenderer key={j} segment={seg} />)}
                  {msg.segments.length === 0 && <span className="text-theme-hint">[不支持的消息类型]</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
