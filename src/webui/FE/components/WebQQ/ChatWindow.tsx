import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Users, Send, Image as ImageIcon, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import type { ChatSession, RawMessage, MessageElement } from '../../types/webqq'
import { getMessages, sendMessage, uploadImage, formatMessageTime, isEmptyMessage, isValidImageFormat, getSelfUid, getSelfUin } from '../../utils/webqqApi'
import { useWebQQStore, hasVisitedChat, markChatVisited } from '../../stores/webqqStore'
import { getToken } from '../../utils/api'
import { showToast } from '../Toast'

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

const getProxyImageUrl = (url: string | undefined): string => {
  if (!url) return ''
  if (url.startsWith('blob:')) return url
  if (url.includes('qpic.cn') || url.includes('multimedia.nt.qq.com.cn')) {
    return `/api/webqq/image-proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(getToken() || '')}`
  }
  return url
}

const MessageElementRenderer = memo<{ element: MessageElement }>(({ element }) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  if (element.textElement) return <span className="whitespace-pre-wrap break-words">{element.textElement.content}</span>
  if (element.picElement) {
    const pic = element.picElement
    let url = pic.originImageUrl ? (pic.originImageUrl.startsWith('http') ? pic.originImageUrl : `https://gchat.qpic.cn${pic.originImageUrl}`) : ''
    const proxyUrl = getProxyImageUrl(url)
    
    // 计算显示尺寸，保持比例，最大高度200px，最大宽度100%
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
        className="relative rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
        style={{ width: displayWidth, height: displayHeight }}
        onClick={() => window.open(proxyUrl, '_blank')}
      >
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
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
  if (element.faceElement) return <span>[表情]</span>
  if (element.fileElement) return <span>[文件: {element.fileElement.fileName}]</span>
  if (element.pttElement) return <span>[语音消息]</span>
  if (element.videoElement) return <span>[视频消息]</span>
  return null
})

const RawMessageBubble = memo<{ message: RawMessage; allMessages: RawMessage[] }>(({ message, allMessages }) => {
  const selfUid = getSelfUid()
  const isSelf = selfUid ? message.senderUid === selfUid : false
  const senderName = message.sendMemberName || message.sendNickName || message.senderUin
  const senderAvatar = `https://q1.qlogo.cn/g?b=qq&nk=${message.senderUin}&s=640`
  const timestamp = parseInt(message.msgTime) * 1000
  
  if (!message.elements || !Array.isArray(message.elements)) return null

  // 分离 reply 元素和其他元素
  const replyElement = message.elements.find(el => el.replyElement)?.replyElement
  const otherElements = message.elements.filter(el => !el.replyElement)

  // 查找被引用的原消息
  const replySourceMsg = replyElement ? allMessages.find(m => m.msgId === replyElement.replayMsgId || m.msgSeq === replyElement.replayMsgSeq) : null

  return (
    <div className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
      <img src={senderAvatar} alt={senderName} loading="lazy" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
      <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[70%]`}>
        <span className="text-xs text-gray-400 mb-1">{senderName}</span>
        <div className={`rounded-2xl px-4 py-2 min-w-[80px] break-all ${isSelf ? 'bg-pink-500 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-tl-sm shadow-sm'}`}>
          {replyElement && (
            <div className={`text-xs mb-2 pb-2 border-b ${isSelf ? 'border-pink-400/50' : 'border-gray-200'}`}>
              <div className={`${isSelf ? 'bg-pink-400/30' : 'bg-gray-100'} rounded px-2 py-1`}>
                {replySourceMsg ? (
                  <div className="space-y-1">
                    <div className={`font-medium ${isSelf ? 'text-pink-100' : 'text-gray-600'}`}>
                      {replySourceMsg.sendMemberName || replySourceMsg.sendNickName || replySourceMsg.senderUin}:
                    </div>
                    <div className={`${isSelf ? 'text-pink-100' : 'text-gray-500'}`}>
                      {replySourceMsg.elements?.filter(el => !el.replyElement).map((el, i) => (
                        <MessageElementRenderer key={i} element={el} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className={`${isSelf ? 'text-pink-100' : 'text-gray-500'}`}>
                    {replyElement.sourceMsgText || '[消息]'}
                  </span>
                )}
              </div>
            </div>
          )}
          {otherElements.map((element, index) => <MessageElementRenderer key={index} element={element} />)}
        </div>
        <span className="text-xs text-gray-400 mt-1">{formatMessageTime(timestamp)}</span>
      </div>
    </div>
  )
})

const TempMessageBubble = memo<{ message: TempMessage; onRetry: () => void }>(({ message, onRetry }) => {
  const selfUin = getSelfUin()
  const selfAvatar = selfUin ? `https://q1.qlogo.cn/g?b=qq&nk=${selfUin}&s=640` : ''
  
  return (
    <div className="flex gap-2 flex-row-reverse">
      {selfAvatar && <img src={selfAvatar} alt="我" loading="lazy" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />}
      <div className="flex flex-col items-end max-w-[70%]">
        <span className="text-xs text-gray-400 mb-1">我</span>
        <div className="flex items-end gap-1">
          {message.status === 'failed' && <button onClick={onRetry} className="p-1 text-red-500 hover:bg-red-50 rounded" title="重新发送"><RefreshCw size={14} /></button>}
          <div className="rounded-2xl px-4 py-2 bg-pink-500 text-white rounded-br-sm min-w-[80px] break-all">
            {message.text && <span className="whitespace-pre-wrap break-words">{message.text}</span>}
            {message.imageUrl && <img src={message.imageUrl} alt="图片" loading="lazy" className="max-w-full rounded-lg" style={{ maxHeight: '200px' }} />}
          </div>
          {message.status === 'sending' && <Loader2 size={14} className="animate-spin text-gray-400" />}
          {message.status === 'failed' && <AlertCircle size={14} className="text-red-500" />}
        </div>
        <span className="text-xs text-gray-400 mt-1">{formatMessageTime(message.timestamp)}</span>
      </div>
    </div>
  )
})

// 虚拟列表消息项
type MessageItem = { type: 'raw'; data: RawMessage } | { type: 'temp'; data: TempMessage }

const ChatWindow: React.FC<ChatWindowProps> = ({ session, onShowMembers, onNewMessageCallback }) => {
  const [messages, setMessages] = useState<RawMessage[]>([])
  const [tempMessages, setTempMessages] = useState<TempMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null)
  
  const { getCachedMessages, setCachedMessages, appendCachedMessage, getScrollPosition, setScrollPosition } = useWebQQStore()
  
  const parentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef(session)
  const shouldScrollRef = useRef(true)
  const prevSessionKeyRef = useRef<string | null>(null)
  const allItemsRef = useRef<MessageItem[]>([])
  
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // 合并消息列表
  const allItems = useMemo<MessageItem[]>(() => {
    const seen = new Set<string>()
    const rawItems: MessageItem[] = messages
      .filter(msg => {
        if (!msg || !msg.elements || !Array.isArray(msg.elements)) return false
        if (seen.has(msg.msgId)) return false
        seen.add(msg.msgId)
        return true
      })
      .map(msg => ({ type: 'raw' as const, data: msg }))
    
    const tempItems: MessageItem[] = tempMessages.map(msg => ({ type: 'temp' as const, data: msg }))
    const items = [...rawItems, ...tempItems]
    allItemsRef.current = items
    return items
  }, [messages, tempMessages])

  // 虚拟列表
  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  const scrollToBottom = useCallback(() => {
    if (parentRef.current) {
      requestAnimationFrame(() => {
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [])

  // 保存当前滚动位置（用可见区域最后一条消息的ID定位）
  const saveScrollPosition = useCallback(() => {
    if (!session || !parentRef.current) return
    
    const items = allItemsRef.current
    if (items.length === 0) return
    
    // 找到当前可见区域最后一条消息
    const virtualItems = virtualizer.getVirtualItems()
    if (virtualItems.length === 0) return
    
    const lastVisibleItem = virtualItems[virtualItems.length - 1]
    const item = items[lastVisibleItem.index]
    if (item?.type === 'raw') {
      console.log('保存滚动位置:', item.data.msgId)
      setScrollPosition(session.chatType, session.peerId, {
        msgId: item.data.msgId,
        offset: 0
      })
    }
  }, [session, virtualizer, setScrollPosition])

  // 恢复滚动位置
  const restoreScrollPosition = useCallback(() => {
    if (!session || !parentRef.current) return false
    
    const items = allItemsRef.current
    if (items.length === 0) return false
    
    const savedPosition = getScrollPosition(session.chatType, session.peerId)
    console.log('恢复滚动位置:', savedPosition, 'items:', items.length)
    if (!savedPosition) return false
    
    // 找到保存的消息在列表中的索引
    const msgIndex = items.findIndex(item => 
      item.type === 'raw' && item.data.msgId === savedPosition.msgId
    )
    
    console.log('找到消息索引:', msgIndex)
    if (msgIndex === -1) return false
    
    // 滚动到该消息位置，让它出现在底部
    virtualizer.scrollToIndex(msgIndex, { align: 'end' })
    return true
  }, [session, virtualizer, getScrollPosition])



  // 消息变化时处理滚动
  useEffect(() => {
    if (allItems.length === 0) return
    
    const currentKey = session ? `${session.chatType}_${session.peerId}` : null
    const isNewSession = currentKey !== prevSessionKeyRef.current
    
    if (isNewSession) {
      prevSessionKeyRef.current = currentKey
      // 切换聊天时，尝试恢复保存的位置，否则滚动到底部
      const restored = restoreScrollPosition()
      console.log('切换聊天，恢复结果:', restored)
      if (!restored && parentRef.current) {
        parentRef.current.scrollTop = parentRef.current.scrollHeight
      }
      shouldScrollRef.current = !restored
    } else if (shouldScrollRef.current) {
      scrollToBottom()
    }
  }, [allItems.length, scrollToBottom, session, restoreScrollPosition])

  useEffect(() => {
    if (onNewMessageCallback) {
      const handleNewMessage = (msg: RawMessage) => {
        if (!msg || !msg.msgId || !msg.elements || !Array.isArray(msg.elements)) return
        setMessages(prev => {
          if (prev.some(m => m && m.msgId === msg.msgId)) return prev
          const newMessages = [...prev, msg]
          const currentSession = sessionRef.current
          if (currentSession) {
            appendCachedMessage(currentSession.chatType, currentSession.peerId, msg as any)
          }
          return newMessages
        })
        setTempMessages(prev => prev.filter(t => t.status !== 'sending'))
        shouldScrollRef.current = true
      }
      onNewMessageCallback(handleNewMessage)
    }
    return () => {
      if (onNewMessageCallback) onNewMessageCallback(null)
    }
  }, [onNewMessageCallback, appendCachedMessage])

  const loadMessages = useCallback(async (beforeMsgId?: string) => {
    if (!session) return

    if (beforeMsgId) {
      setLoadingMore(true)
    } else {
      const cachedMessages = getCachedMessages(session.chatType, session.peerId) as RawMessage[] | null
      const validCached = cachedMessages?.filter(m => m && m.elements && Array.isArray(m.elements)) || []
      if (validCached.length > 0) {
        setMessages(validCached)
        shouldScrollRef.current = true
      } else {
        setLoading(true)
      }
    }

    try {
      const result = await getMessages(session.chatType, session.peerId, beforeMsgId)
      const validMessages = result.messages.filter((msg): msg is RawMessage => 
        msg !== null && msg !== undefined && msg.elements && Array.isArray(msg.elements)
      )
      
      if (beforeMsgId) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.msgId))
          const newMsgs = validMessages.filter(m => !existingIds.has(m.msgId))
          const merged = [...newMsgs, ...prev]
          merged.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
          setCachedMessages(session.chatType, session.peerId, merged as any)
          return merged
        })
      } else {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.msgId))
          const newMsgs = validMessages.filter(m => !existingIds.has(m.msgId))
          const merged = [...newMsgs, ...prev]
          merged.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
          setCachedMessages(session.chatType, session.peerId, merged as any)
          return merged
        })
        shouldScrollRef.current = true
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
  }, [session, getCachedMessages, setCachedMessages])

  useEffect(() => {
    if (session) {
      // 切换聊天时重置滚动标记
      shouldScrollRef.current = true
      
      const cachedMessages = getCachedMessages(session.chatType, session.peerId) as RawMessage[] | null
      if (cachedMessages && cachedMessages.length > 0) {
        const validMessages = cachedMessages.filter(m => m.elements && Array.isArray(m.elements))
        setMessages(validMessages.length > 0 ? validMessages : [])
      } else {
        setMessages([])
      }
      setTempMessages([])
      
      // 只有首次访问该聊天时才调用 messages 接口
      if (!hasVisitedChat(session.chatType, session.peerId)) {
        markChatVisited(session.chatType, session.peerId)
        loadMessages()
      }
    } else {
      setMessages([])
      setTempMessages([])
    }
  }, [session?.peerId, session?.chatType])

  const handleScroll = useCallback(() => {
    const container = parentRef.current
    if (!container || loadingMore || messages.length === 0) return
    
    // 检查是否在底部附近
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    shouldScrollRef.current = isNearBottom
    
    // 保存滚动位置
    saveScrollPosition()
    
    // 加载更多历史消息
    if (hasMore && container.scrollTop < 50) {
      const firstMsgId = messages[0]?.msgId
      if (firstMsgId) loadMessages(firstMsgId)
    }
  }, [loadingMore, hasMore, messages, loadMessages, saveScrollPosition])

  const handleSendText = useCallback(async () => {
    if (!session || isEmptyMessage(inputText)) return
    setSending(true)
    const text = inputText.trim()
    setInputText('')
    shouldScrollRef.current = true

    const tempId = `temp_${Date.now()}`
    setTempMessages(prev => [...prev, { msgId: tempId, text, timestamp: Date.now(), status: 'sending' }])

    try {
      await sendMessage({ chatType: session.chatType, peerId: session.peerId, content: [{ type: 'text', text }] })
      setTempMessages(prev => prev.filter(t => t.msgId !== tempId))
    } catch (e: any) {
      showToast('发送失败', 'error')
      setTempMessages(prev => prev.map(t => t.msgId === tempId ? { ...t, status: 'failed' as const } : t))
    } finally {
      setSending(false)
    }
  }, [session, inputText])

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
    shouldScrollRef.current = true

    const tempId = `temp_${Date.now()}`
    setTempMessages(prev => [...prev, { msgId: tempId, imageUrl: url, timestamp: Date.now(), status: 'sending' }])

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
  }, [session, imagePreview])

  const handleRetryTemp = useCallback((tempMsg: TempMessage) => {
    setTempMessages(prev => prev.filter(t => t.msgId !== tempMsg.msgId))
    if (tempMsg.text) setInputText(tempMsg.text)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText() }
  }, [handleSendText])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        
        // 检查格式
        const ext = file.type.split('/')[1]?.toLowerCase()
        if (!['jpeg', 'jpg', 'png', 'gif'].includes(ext)) {
          showToast('不支持的图片格式，仅支持 JPG、PNG、GIF', 'error')
          return
        }
        
        setImagePreview({ file, url: URL.createObjectURL(file) })
        return
      }
    }
  }, [])

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

      <div ref={parentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4">
        {loadingMore && <div className="flex justify-center py-2"><Loader2 size={20} className="animate-spin text-pink-500" /></div>}
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
        ) : allItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">暂无消息</div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const item = allItems[virtualRow.index]
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    padding: '8px 0',
                  }}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                >
                  {item.type === 'raw' ? (
                    <RawMessageBubble message={item.data} allMessages={messages} />
                  ) : (
                    <TempMessageBubble message={item.data} onRetry={() => handleRetryTemp(item.data)} />
                  )}
                </div>
              )
            })}
          </div>
        )}
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
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder="输入消息..." disabled={sending} rows={1} className="w-full px-4 py-2.5 bg-gray-100/50 border border-gray-200/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/20 disabled:opacity-50" style={{ minHeight: '42px', maxHeight: '120px' }} />
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

export default ChatWindow
