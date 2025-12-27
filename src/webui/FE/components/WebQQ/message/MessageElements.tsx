import React, { useState, memo, useRef } from 'react'
import { Loader2, Mic, Play, Pause } from 'lucide-react'
import type { MessageElement, RawMessage } from '../../../types/webqq'
import { getToken } from '../../../utils/api'
import { translatePttToText, getAudioProxyUrl } from '../../../utils/webqqApi'

// 图片预览上下文
export const ImagePreviewContext = React.createContext<{
  showPreview: (url: string) => void
} | null>(null)

// 视频预览上下文
export const VideoPreviewContext = React.createContext<{
  showPreview: (chatType: number, peerUid: string, msgId: string, elementId: string) => void
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
    
    return (
      <div 
        className="relative rounded-lg overflow-hidden bg-theme-item cursor-pointer"
        style={{ width: displayWidth, height: displayHeight }}
        onClick={() => previewContext?.showPreview(proxyUrl)}
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
  if (element.arkElement) return <span>[卡片消息]</span>
  if (element.marketFaceElement) return <span>[{element.marketFaceElement.faceName || '表情包'}]</span>
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
    element.marketFaceElement
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
