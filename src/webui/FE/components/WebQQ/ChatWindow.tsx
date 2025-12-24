import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Users, Send, Image as ImageIcon, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import type { ChatSession, RawMessage, MessageElement } from '../../types/webqq'
import { getMessages, sendMessage, uploadImage, formatMessageTime, isEmptyMessage, isValidImageFormat, getSelfUid } from '../../utils/webqqApi'
import { useWebQQStore } from '../../stores/webqqStore'
import { getToken } from '../../utils/api'
import { showToast } from '../Toast'

// 临时消息类型（用于乐观更新）
interface TempMessage {
  msgId: string
  text?: string
  imageUrl?: string
  timestamp: number
  status: 'sending' | 'sent' | 'failed'
}

interface ChatWindowProps {
  session: ChatSession | null
  onShowMembers?: () => void
  onNewMessageCallback?: (callback: ((msg: RawMessage) => void) | null) => void
}

const ChatWindow: React.FC<ChatWindowProps> = ({ session, onShowMembers, onNewMessageCallback }) => {
  const [messages, setMessages] = useState<RawMessage[]>([])
  const [tempMessages, setTempMessages] = useState<TempMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null)
  
  const { getCachedMessages, setCachedMessages, appendCachedMessage } = useWebQQStore()
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 使用 ref 来存储 session，避免闭包问题
  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // 注册新消息回调 - 放在最前面，确保总是执行
  useEffect(() => {
    console.log('ChatWindow: 注册新消息回调, session:', session?.peerId)
    if (onNewMessageCallback) {
      const handleNewMessage = (msg: RawMessage) => {
        // 过滤无效消息
        if (!msg || !msg.msgId || !msg.elements || !Array.isArray(msg.elements)) {
          console.warn('收到无效的SSE消息:', msg)
          return
        }
        console.log('ChatWindow: 收到新消息', msg.msgId)
        setMessages(prev => {
          if (prev.some(m => m && m.msgId === msg.msgId)) {
            console.log('ChatWindow: 消息已存在，跳过')
            return prev
          }
          const newMessages = [...prev, msg]
          const currentSession = sessionRef.current
          if (currentSession) {
            appendCachedMessage(currentSession.chatType, currentSession.peerId, msg as any)
          }
          return newMessages
        })
        setTempMessages(prev => prev.filter(t => t.status !== 'sending'))
        setTimeout(scrollToBottom, 100)
      }
      onNewMessageCallback(handleNewMessage)
    }
    return () => {
      console.log('ChatWindow: 清理回调')
      if (onNewMessageCallback) onNewMessageCallback(null)
    }
  }, [onNewMessageCallback, scrollToBottom, appendCachedMessage])

  const loadMessages = useCallback(async (beforeMsgId?: string) => {
    if (!session) return

    if (beforeMsgId) {
      setLoadingMore(true)
    } else {
      const cachedMessages = getCachedMessages(session.chatType, session.peerId) as RawMessage[] | null
      if (cachedMessages && cachedMessages.length > 0) {
        // 过滤掉无效的缓存消息
        const validCached = cachedMessages.filter(m => m && m.elements && Array.isArray(m.elements))
        if (validCached.length > 0) {
          setMessages(validCached)
          setTimeout(scrollToBottom, 100)
        }
      }
      setLoading(true)
    }

    try {
      const result = await getMessages(session.chatType, session.peerId, beforeMsgId)
      console.log('API返回的消息:', result.messages)
      // 过滤掉无效的消息（没有 elements 字段的）
      const validMessages = result.messages.filter((msg): msg is RawMessage => 
        msg !== null && msg !== undefined && msg.elements && Array.isArray(msg.elements)
      )
      console.log('有效消息数量:', validMessages.length, '/', result.messages.length)
      
      if (beforeMsgId) {
        setMessages(prev => {
          // 合并消息并去重
          const existingIds = new Set(prev.map(m => m.msgId))
          const newMsgs = validMessages.filter(m => !existingIds.has(m.msgId))
          const merged = [...newMsgs, ...prev]
          // 按时间排序
          merged.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
          setCachedMessages(session.chatType, session.peerId, merged as any)
          return merged
        })
      } else {
        setMessages(prev => {
          // 合并历史消息和已有消息（可能是 SSE 推送的新消息）
          const existingIds = new Set(prev.map(m => m.msgId))
          const newMsgs = validMessages.filter(m => !existingIds.has(m.msgId))
          // 历史消息在前，已有消息在后
          const merged = [...newMsgs, ...prev]
          // 按时间排序
          merged.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
          setCachedMessages(session.chatType, session.peerId, merged as any)
          return merged
        })
        setTimeout(scrollToBottom, 100)
      }
      setHasMore(result.hasMore)
    } catch (e: any) {
      if (!beforeMsgId) {
        const cachedMessages = getCachedMessages(session.chatType, session.peerId)
        if (!cachedMessages || cachedMessages.length === 0) {
          showToast('加载消息失败', 'error')
        }
      } else {
        showToast('加载更多消息失败', 'error')
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [session, scrollToBottom, getCachedMessages, setCachedMessages])

  useEffect(() => {
    if (session) {
      const cachedMessages = getCachedMessages(session.chatType, session.peerId) as RawMessage[] | null
      // 过滤掉旧格式的缓存数据（没有 elements 字段的）
      if (cachedMessages && cachedMessages.length > 0) {
        const validMessages = cachedMessages.filter(m => m.elements && Array.isArray(m.elements))
        if (validMessages.length > 0) {
          setMessages(validMessages)
          setTimeout(scrollToBottom, 50)
        } else {
          setMessages([])
        }
      } else {
        setMessages([])
      }
      setTempMessages([])
      loadMessages()
    } else {
      setMessages([])
      setTempMessages([])
    }
  }, [session?.peerId, session?.chatType])

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container || loadingMore || !hasMore || messages.length === 0) return
    if (container.scrollTop < 50) {
      const firstMsgId = messages[0]?.msgId
      if (firstMsgId) loadMessages(firstMsgId)
    }
  }, [loadingMore, hasMore, messages, loadMessages])

  const handleSendText = useCallback(async () => {
    if (!session || isEmptyMessage(inputText)) return
    setSending(true)
    const text = inputText.trim()
    setInputText('')

    const tempId = `temp_${Date.now()}`
    setTempMessages(prev => [...prev, { msgId: tempId, text, timestamp: Date.now(), status: 'sending' }])
    setTimeout(scrollToBottom, 100)

    try {
      await sendMessage({ chatType: session.chatType, peerId: session.peerId, content: [{ type: 'text', text }] })
      setTempMessages(prev => prev.filter(t => t.msgId !== tempId))
    } catch (e: any) {
      showToast('发送失败', 'error')
      setTempMessages(prev => prev.map(t => t.msgId === tempId ? { ...t, status: 'failed' as const } : t))
    } finally {
      setSending(false)
    }
  }, [session, inputText, scrollToBottom])

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isValidImageFormat(file.name)) {
      showToast('不支持的图片格式，仅支持 JPG、PNG、GIF', 'error')
      return
    }
    setImagePreview({ file, url: URL.createObjectURL(file) })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleSendImage = useCallback(async () => {
    if (!session || !imagePreview) return
    setSending(true)
    const { file, url } = imagePreview
    setImagePreview(null)

    const tempId = `temp_${Date.now()}`
    setTempMessages(prev => [...prev, { msgId: tempId, imageUrl: url, timestamp: Date.now(), status: 'sending' }])
    setTimeout(scrollToBottom, 100)

    try {
      const uploadResult = await uploadImage(file)
      await sendMessage({ chatType: session.chatType, peerId: session.peerId, content: [{ type: 'image', imagePath: uploadResult.imagePath }] })
      setTempMessages(prev => prev.filter(t => t.msgId !== tempId))
    } catch (e: any) {
      showToast('发送图片失败', 'error')
      setTempMessages(prev => prev.map(t => t.msgId === tempId ? { ...t, status: 'failed' as const } : t))
    } finally {
      setSending(false)
      URL.revokeObjectURL(url)
    }
  }, [session, imagePreview, scrollToBottom])

  const handleRetryTemp = useCallback((tempMsg: TempMessage) => {
    setTempMessages(prev => prev.filter(t => t.msgId !== tempMsg.msgId))
    if (tempMsg.text) setInputText(tempMsg.text)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText() }
  }, [handleSendText])

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50/30">
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">💬</div>
          <p>选择一个联系人开始聊天</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/50 bg-white/30">
        <div className="flex items-center gap-3">
          <img src={session.peerAvatar} alt={session.peerName} className="w-10 h-10 rounded-full object-cover" />
          <div>
            <div className="font-medium text-gray-800">{session.peerName}</div>
            <div className="text-xs text-gray-400">{session.chatType === 'group' ? '群聊' : '私聊'}</div>
          </div>
        </div>
        {session.chatType === 'group' && onShowMembers && (
          <button onClick={onShowMembers} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 rounded-lg" title="查看群成员">
            <Users size={20} />
          </button>
        )}
      </div>

      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingMore && <div className="flex justify-center py-2"><Loader2 size={20} className="animate-spin text-pink-500" /></div>}
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
        ) : messages.length === 0 && tempMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">暂无消息</div>
        ) : (
          <>
            {(() => {
              // 渲染前去重，确保没有重复的 msgId
              const seen = new Set<string>()
              const uniqueMessages = messages.filter(msg => {
                if (!msg || !msg.elements || !Array.isArray(msg.elements)) return false
                if (seen.has(msg.msgId)) return false
                seen.add(msg.msgId)
                return true
              })
              return uniqueMessages.map(msg => <RawMessageBubble key={msg.msgId} message={msg} />)
            })()}
            {tempMessages.map(msg => <TempMessageBubble key={msg.msgId} message={msg} onRetry={() => handleRetryTemp(msg)} />)}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {imagePreview && (
        <div className="px-4 py-2 border-t border-gray-200/50 bg-gray-50/50">
          <div className="relative inline-block">
            <img src={imagePreview.url} alt="预览" className="max-h-32 rounded-lg" />
            <button onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null) }} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-200/50 bg-white/30">
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/jpeg,image/png,image/gif" className="hidden" />
          <div className="flex-1">
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入消息..." disabled={sending} rows={1} className="w-full px-4 py-2.5 bg-gray-100/50 border border-gray-200/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/20 disabled:opacity-50" style={{ minHeight: '42px', maxHeight: '120px' }} />
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="p-2.5 text-gray-500 hover:text-pink-500 hover:bg-pink-50 rounded-xl disabled:opacity-50" title="发送图片">
            <ImageIcon size={20} />
          </button>
          <button onClick={imagePreview ? handleSendImage : handleSendText} disabled={sending || (!imagePreview && isEmptyMessage(inputText))} className="p-2.5 bg-pink-500 text-white rounded-xl hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}

const RawMessageBubble: React.FC<{ message: RawMessage }> = ({ message }) => {
  const selfUid = getSelfUid()
  const isSelf = selfUid ? message.senderUid === selfUid : false
  const senderName = message.sendMemberName || message.sendNickName || message.senderUin
  const senderAvatar = `https://q1.qlogo.cn/g?b=qq&nk=${message.senderUin}&s=640`
  const timestamp = parseInt(message.msgTime) * 1000
  
  // 兼容旧缓存数据，如果 elements 不存在则跳过渲染
  if (!message.elements || !Array.isArray(message.elements)) {
    return null
  }

  return (
    <div className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
      {!isSelf && <img src={senderAvatar} alt={senderName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />}
      <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[70%]`}>
        {!isSelf && <span className="text-xs text-gray-400 mb-1">{senderName}</span>}
        <div className={`rounded-2xl px-4 py-2 ${isSelf ? 'bg-pink-500 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'}`}>
          {message.elements.map((element, index) => <MessageElementRenderer key={index} element={element} />)}
        </div>
        <span className="text-xs text-gray-400 mt-1">{formatMessageTime(timestamp)}</span>
      </div>
    </div>
  )
}

const TempMessageBubble: React.FC<{ message: TempMessage; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex gap-2 flex-row-reverse">
    <div className="flex flex-col items-end max-w-[70%]">
      <div className="flex items-end gap-1">
        {message.status === 'failed' && <button onClick={onRetry} className="p-1 text-red-500 hover:bg-red-50 rounded" title="重新发送"><RefreshCw size={14} /></button>}
        <div className="rounded-2xl px-4 py-2 bg-pink-500 text-white rounded-br-sm">
          {message.text && <span className="whitespace-pre-wrap break-words">{message.text}</span>}
          {message.imageUrl && <img src={message.imageUrl} alt="图片" className="max-w-full rounded-lg" style={{ maxHeight: '200px' }} />}
        </div>
        {message.status === 'sending' && <Loader2 size={14} className="animate-spin text-gray-400" />}
        {message.status === 'failed' && <AlertCircle size={14} className="text-red-500" />}
      </div>
      <span className="text-xs text-gray-400 mt-1">{formatMessageTime(message.timestamp)}</span>
    </div>
  </div>
)

const MessageElementRenderer: React.FC<{ element: MessageElement }> = ({ element }) => {
  if (element.textElement) return <span className="whitespace-pre-wrap break-words">{element.textElement.content}</span>
  if (element.picElement) {
    const pic = element.picElement
    let url = pic.originImageUrl ? (pic.originImageUrl.startsWith('http') ? pic.originImageUrl : `https://gchat.qpic.cn${pic.originImageUrl}`) : ''
    const proxyUrl = getProxyImageUrl(url)
    return <img src={proxyUrl} alt="图片" className="max-w-full rounded-lg cursor-pointer" style={{ maxHeight: '200px' }} onClick={() => window.open(proxyUrl, '_blank')} />
  }
  if (element.faceElement) return <span>[表情]</span>
  if (element.replyElement) return <span className="text-xs text-gray-400">[回复消息]</span>
  if (element.fileElement) return <span>[文件: {element.fileElement.fileName}]</span>
  if (element.pttElement) return <span>[语音消息]</span>
  if (element.videoElement) return <span>[视频消息]</span>
  return null
}

const getProxyImageUrl = (url: string | undefined): string => {
  if (!url) return ''
  if (url.startsWith('blob:')) return url
  if (url.includes('qpic.cn') || url.includes('multimedia.nt.qq.com.cn')) {
    return `/api/webqq/image-proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(getToken() || '')}`
  }
  return url
}

export default ChatWindow
