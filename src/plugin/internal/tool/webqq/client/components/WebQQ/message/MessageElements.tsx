import React, { useState, useEffect, memo, useRef } from 'react'
import { Loader2, Mic, Play, Pause, ChevronRight, X, FileText } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Slot, type WebQQElement } from '@luckylillia/plugin-sdk/webui'
import type { MessageElement, RawMessage } from '../../../types/webqq'
import { webui } from '../../../context'
import { slotMessage } from '../../../utils/slotMessage'
import { translatePttToText, getAudioBlob, getForwardMessages, getPrivateFileUrl, getSelfUid, getUserAvatar } from '../../../utils/webqqApi'
import type { ForwardMessageItem, ForwardMessageSegment } from '../../../utils/webqqApi'
import { useImageRkeyStore } from '../../../stores/imageRkeyStore'
import { showToast } from '../common'

export const ImagePreviewContext = React.createContext<{
  showPreview: (url: string) => void
} | null>(null)

export const VideoPreviewContext = React.createContext<{
  showPreview: (fileUuid: string, isGroup: boolean) => void
} | null>(null)

// 用于"添加到表情"
export const ImageContextMenuContext = React.createContext<{
  showMenu: (e: React.MouseEvent, message: RawMessage, elementId: string) => void
} | null>(null)

// 点聊天里的文件卡片时打开群文件面板并定位
export const FileCardContext = React.createContext<{
  open: (t: { fileId: string; folderId: string }) => void
} | null>(null)

// 按 appid 拼上 rkey (跟 BE image-proxy 一致), 配合 referrerPolicy="no-referrer" 直连 CDN; rkey 来自 useImageRkeyStore
export const getProxyImageUrl = (
  url: string | undefined,
  rkeys?: { privateRkey: string; groupRkey: string },
): string => {
  if (!url) return ''
  if (url.startsWith('blob:')) return url
  if (url.includes('qpic.cn') || url.includes('multimedia.nt.qq.com.cn')) {
    if (url.includes('rkey=')) return url
    try {
      const appid = new URL(url).searchParams.get('appid')
      if (appid === '1406' && rkeys?.privateRkey) return url + rkeys.privateRkey
      if (appid === '1407' && rkeys?.groupRkey) return url + rkeys.groupRkey
    } catch {
    }
    return url
  }
  return url
}

/** An element as a plugin draws it (the `webqq.message.element` slot, keyed by its type), else as WebQQ does. */
export const MessageElementRenderer = memo<{ element: MessageElement; message?: RawMessage }>(({ element, message }) => (
  <Slot
    name="webqq.message.element"
    match={String(element.elementType)}
    props={{ element: element as unknown as WebQQElement, message: message && slotMessage(message) }}
  >
    <BuiltinElement element={element} message={message} />
  </Slot>
))

const BuiltinElement = memo<{ element: MessageElement; message?: RawMessage }>(({ element, message }) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [videoThumbLoaded, setVideoThumbLoaded] = useState(false)
  const [videoThumbError, setVideoThumbError] = useState(false)
  const previewContext = React.useContext(ImagePreviewContext)
  const videoPreviewContext = React.useContext(VideoPreviewContext)
  const imageContextMenuContext = React.useContext(ImageContextMenuContext)
  const privateRkey = useImageRkeyStore((s) => s.privateRkey)
  const groupRkey = useImageRkeyStore((s) => s.groupRkey)
  useEffect(() => {
    if (element.picElement) useImageRkeyStore.getState().ensureRkey()
  }, [element])

  if (element.textElement) return <span className="whitespace-pre-wrap break-all" style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{element.textElement.content}</span>
  if (element.picElement) {
    const pic = element.picElement
    const url = pic.originImageUrl ? (pic.originImageUrl.startsWith('http') ? pic.originImageUrl : `https://gchat.qpic.cn${pic.originImageUrl}`) : ''
    const proxyUrl = getProxyImageUrl(url, { privateRkey, groupRkey })

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
          referrerPolicy="no-referrer"
          className={`w-full h-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => { setImageError(true); useImageRkeyStore.getState().refresh() }}
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
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const span = document.createElement('span')
          span.textContent = faceText || `[表情${faceId}]`
          target.parentNode?.insertBefore(span, target)
        }}
      />
    )
  }
  if (element.fileElement) {
    const f = element.fileElement
    const isGroup = message?.chatType === 2
    // 群文件点了定位到群文件面板, 私聊文件点了直接下载
    const groupFile = isGroup ? { fileId: f.fileUuid, folderId: f.folderId } : undefined
    const privateFile = message && !isGroup && f.fileUuid
      ? { fileId: f.fileUuid, peerUid: message.peerUid, isSelfSend: message.senderUid === getSelfUid() }
      : undefined
    return <FileElementCard fileName={f.fileName} fileSize={f.fileSize} groupFile={groupFile} privateFile={privateFile} />
  }
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
        thumbUrl = webui().authUrl(`/api/webqq/file-proxy?path=${encodeURIComponent(firstThumb)}`)
      }
    }

    const duration = video.fileTime || 0
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

    const handleClick = () => {
      if (video.fileUuid) {
        videoPreviewContext?.showPreview(video.fileUuid, message?.chatType === 2)
      }
    }

    return (
      <div
        className="relative rounded-lg overflow-hidden bg-theme-item cursor-pointer group"
        style={{ width: displayWidth, height: displayHeight }}
        onClick={handleClick}
      >
        <div className="absolute inset-0 fill-quiet" />

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

// 不带状态文字 ("已发送"等), 由外层 MessageBubble 决定
const FileElementCard = memo<{
  fileName: string
  fileSize: number
  groupFile?: { fileId: string; folderId: string }
  privateFile?: { fileId: string; peerUid: string; isSelfSend: boolean }
}>(({ fileName, fileSize, groupFile, privateFile }) => {
  const sizeText = formatFileSize(fileSize)
  const fileCardContext = React.useContext(FileCardContext)
  const [downloading, setDownloading] = useState(false)
  const groupClickable = !!groupFile && !!fileCardContext
  const privateClickable = !!privateFile
  const clickable = groupClickable || privateClickable

  const handleClick = async () => {
    if (groupClickable) {
      fileCardContext!.open(groupFile!)
      return
    }
    if (privateClickable && !downloading) {
      setDownloading(true)
      try {
        const url = await getPrivateFileUrl(privateFile!.peerUid, privateFile!.fileId, privateFile!.isSelfSend)
        window.open(url, '_blank')
      } catch (e) {
        showToast((e as Error).message || '下载失败', 'error')
      } finally {
        setDownloading(false)
      }
    }
  }

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 dark:bg-white/5 border border-white/10 min-w-[220px] max-w-[280px]${clickable ? ' cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
      onClick={clickable ? handleClick : undefined}
      title={groupClickable ? '在群文件中查看' : privateClickable ? '点击下载' : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-snug line-clamp-2 break-all">{fileName}</div>
        {sizeText && <div className="text-xs opacity-60 mt-1">{sizeText}</div>}
      </div>
      <div className="flex-shrink-0 w-10 h-10 rounded bg-white/10 flex items-center justify-center">
        {downloading ? <Loader2 className="w-5 h-5 opacity-70 animate-spin" /> : <FileText className="w-5 h-5 opacity-70" />}
      </div>
    </div>
  )
})

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`
}

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

export const isSystemTipMessage = (message: RawMessage): boolean => {
  if (!message.elements || message.elements.length === 0) return false
  return message.elements.every(el => el.grayTipElement || el.replyElement)
}

const PttElementRenderer: React.FC<{ element: MessageElement; message?: RawMessage }> = ({ element, message }) => {
  const [transcribedText, setTranscribedText] = useState<string | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const audioRequestRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    audioRequestRef.current?.abort()
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.onloadeddata = null
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
  }, [])

  const ptt = element.pttElement!
  const duration = ptt.duration || 0
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  const durationStr = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}"`

  const existingText = ptt.text

  const minWidth = 80
  const maxWidth = 200
  const width = Math.min(maxWidth, Math.max(minWidth, minWidth + duration * 3))

  const handlePlay = async () => {
    if (!message || (!ptt.fileUuid && !ptt.filePath) || isLoading) return

    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    if (audioRef.current && audioRef.current.readyState >= 2) {
      try {
        await audioRef.current.play()
        if (audioRequestRef.current?.signal.aborted) return
        setIsPlaying(true)
      } catch {
        if (audioRequestRef.current?.signal.aborted) return
        setIsPlaying(false)
        showToast('语音播放失败，请再次点击播放', 'error')
      }
      return
    }

    setIsLoading(true)
    const request = new AbortController()
    audioRequestRef.current = request
    try {
      const isGroup = message.chatType === 2
      const blob = await getAudioBlob(ptt.fileUuid || '', isGroup, ptt.filePath, request.signal)
      if (request.signal.aborted) return
      if (audioRef.current) {
        audioRef.current.onended = null
        audioRef.current.onerror = null
        audioRef.current.onloadeddata = null
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url

      const audio = new Audio()
      audioRef.current = audio

      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setIsPlaying(false)
        setIsLoading(false)
        showToast('语音无法播放，请重试', 'error')
      }

      audio.onloadeddata = async () => {
        setIsLoading(false)
        try {
          await audio.play()
          if (request.signal.aborted) return
          setIsPlaying(true)
        } catch {
          if (request.signal.aborted) return
          setIsPlaying(false)
          showToast('语音播放失败，请再次点击播放', 'error')
        }
      }

      audio.src = url
    } catch (e) {
      if (request.signal.aborted) return
      showToast(e instanceof Error ? e.message : '获取语音失败，请重试', 'error')
      setIsPlaying(false)
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
            className="w-6 h-6 flex items-center justify-center rounded-full fill-quiet fill-quiet-hover text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
            title="语音转文字"
          >
            {isTranscribing ? <Loader2 size={12} className="animate-spin" /> : '文'}
          </button>
        )}
      </div>

      {/* 转换后的文字 */}
      {(existingText || transcribedText) && (
        <div className={`text-sm px-3 py-1.5 fill-quiet r-control max-w-[250px] ${transcribeError ? 'text-red-500' : 'text-theme-secondary'}`}>
          {existingText || transcribedText}
        </div>
      )}
    </div>
  )
}

// 弹窗里用
const ForwardSegmentRenderer: React.FC<{ segment: ForwardMessageSegment }> = ({ segment }) => {
  const previewContext = React.useContext(ImagePreviewContext)
  const privateRkey = useImageRkeyStore((s) => s.privateRkey)
  const groupRkey = useImageRkeyStore((s) => s.groupRkey)
  useEffect(() => {
    if (segment.type === 'image') useImageRkeyStore.getState().ensureRkey()
  }, [segment])

  if (segment.type === 'text' && segment.data.text) {
    return <span className="whitespace-pre-wrap break-all" style={{ overflowWrap: 'anywhere' }}>{segment.data.text}</span>
  }
  if (segment.type === 'image' && segment.data.url) {
    const proxyUrl = getProxyImageUrl(segment.data.url, { privateRkey, groupRkey })
    return (
      <img
        src={proxyUrl}
        alt="图片"
        loading="lazy"
        referrerPolicy="no-referrer"
        className="max-w-[200px] max-h-[150px] rounded-lg cursor-pointer object-cover"
        onClick={() => previewContext?.showPreview(proxyUrl)}
        onError={() => useImageRkeyStore.getState().refresh()}
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

const NestedForwardCard: React.FC<{ resId: string; title: string }> = ({ resId, title }) => {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 fill-quiet r-control cursor-pointer fill-quiet-hover transition-colors"
        onClick={() => setShowModal(true)}
      >
        <span className="text-sm text-theme-secondary">{title}</span>
        <ChevronRight size={14} className="text-theme-hint flex-shrink-0" />
      </div>
      {showModal && <ForwardMsgModal resId={resId} title={title} onClose={() => setShowModal(false)} />}
    </>
  )
}

function parseForwardXml(xmlContent: string): { title: string; previews: string[]; summary: string } {
  const title = xmlContent.match(/<title[^>]*color="#000000"[^>]*>(.*?)<\/title>/)?.[1] || '[聊天记录]'
  const previewMatches = xmlContent.match(/<title[^>]*color="#777777"[^>]*>(.*?)<\/title>/g)
  const previews = previewMatches?.map(m => m.replace(/<[^>]+>/g, '')) || []
  const summary = xmlContent.match(/<summary[^>]*>(.*?)<\/summary>/)?.[1] || ''
  return { title, previews, summary }
}

const ForwardMsgElementRenderer: React.FC<{ element: MessageElement }> = ({ element }) => {
  const [showModal, setShowModal] = useState(false)
  const forward = element.multiForwardMsgElement!
  const { title, previews, summary } = parseForwardXml(forward.xmlContent)

  return (
    <>
      <div
        className="w-[240px] fill-quiet r-control overflow-hidden cursor-pointer fill-quiet-hover transition-colors border border-theme-divider"
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

// 自己发出的合并转发是 ark 形态
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
        className="w-[240px] fill-quiet r-control overflow-hidden cursor-pointer fill-quiet-hover transition-colors border border-theme-divider"
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center scrim" onClick={onClose}>
      <div
        className="glass glass-thick r-window glass-pop w-[90vw] max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider flex-shrink-0">
          <span className="font-medium text-theme">{title}</span>
          <button onClick={onClose} className="p-1 rounded-full fill-quiet-hover transition-colors">
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
                src={getUserAvatar(msg.senderUin)}
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
