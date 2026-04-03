import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Users, Loader2, ArrowLeft, ArrowDown } from 'lucide-react'
import type { ChatSession, RawMessage } from '../../types/webqq'
import { getMessages, getSelfUid, getSelfUin, getUserProfile, UserProfile, kickGroupMember, getGroupProfile, GroupProfile, quitGroup, muteGroupMember, setMemberTitle } from '../../utils/webqqApi'
import { useWebQQStore, hasVisitedChat, markChatVisited } from '../../stores/webqqStore'
import { getCachedMessages, setCachedMessages, appendCachedMessage, removeCachedMessage } from '../../utils/messageDb'
import { showToast } from '../common'

import { UserProfileCard } from './profile/UserProfileCard'
import { GroupProfileCard } from './profile/GroupProfileCard'
import { ImagePreviewModal, VideoPreviewModal } from './common/PreviewModals'
import { ImagePreviewContext, VideoPreviewContext, ImageContextMenuContext } from './message/MessageElements'
import { RawMessageBubble, TempMessageBubble, MessageContextMenuContext, AvatarContextMenuContext, ScrollToMessageContext, GroupMembersContext, FriendsContext } from './message/MessageBubble'
import type { TempMessage, AvatarContextMenuInfo, FriendInfo } from './message/MessageBubble'
import { MuteDialog, KickConfirmDialog, TitleDialog } from './chat/ChatDialogs'
import { MessageContextMenu, AvatarContextMenu } from './chat/ContextMenus'
import { ChatInput } from './chat/ChatInput'
import { EmojiReactionPicker } from './message/EmojiReactionPicker'

interface EmojiReactionData {
  groupCode: string
  msgSeq: string
  emojiId: string
  userId: string
  userName: string
  isAdd: boolean
}

// 系统提示消息类型
interface SystemTip {
  id: string
  type: 'emoji-reaction'
  userName: string
  emojiId: string
  msgSeq: string
  timestamp: number
}

// 获取表情图片路径（根据 emojiId 判断类型）
function getEmojiImagePath(emojiId: string): string {
  const id = parseInt(emojiId)
  // Unicode emoji 的码点通常大于 1000（QQ 表情 ID 一般在 0-500 范围内）
  if (id > 1000) {
    const codePoint = id.toString(16)
    return `/face/emoji-${codePoint}.png`
  }
  return `/face/${emojiId}.png`
}

// 表情回应系统提示组件（类似戳一戳）
const EmojiReactionTip: React.FC<{ tip: SystemTip; onScrollToMessage: (msgSeq: string) => void }> = ({ tip, onScrollToMessage }) => {
  const imgSrc = getEmojiImagePath(tip.emojiId)
  const emojiId = parseInt(tip.emojiId)

  return (
    <div className="flex justify-center py-2">
      <span className="text-xs text-theme-hint bg-theme-item/50 px-3 py-1 rounded-full">
        <span className="text-blue-500">{tip.userName}</span>
        <span> 回应了</span>
        <span
          className="text-blue-500 cursor-pointer hover:underline"
          onClick={() => onScrollToMessage(tip.msgSeq)}
        >消息</span>
        <span> </span>
        <img
          src={imgSrc}
          alt="emoji"
          className="inline-block w-4 h-4 align-text-bottom"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            if (!img.dataset.fallback) {
              img.dataset.fallback = '1'
              // 如果是 Unicode emoji，尝试显示字符
              if (emojiId > 1000) {
                img.style.display = 'none'
                img.insertAdjacentHTML('afterend', `<span class="text-sm">${String.fromCodePoint(emojiId)}</span>`)
              } else {
                img.src = `https://gxh.vip.qq.com/club/item/parcel/item/${tip.emojiId.slice(0, 2)}/${tip.emojiId}/100x100.png`
              }
            }
          }}
        />
      </span>
    </div>
  )
}

interface ChatWindowProps {
  session: ChatSession | null
  onShowMembers?: () => void
  onNewMessageCallback?: (callback: ((msg: RawMessage) => void) | null) => void
  onEmojiReactionCallback?: (callback: ((data: EmojiReactionData) => void) | null) => void
  onMessageRecalledCallback?: (callback: ((data: { msgId: string; msgSeq: string }) => void) | null) => void
  appendInputMention?: { uid: string; uin: string; name: string } | null
  onAppendInputMentionConsumed?: () => void
  onBack?: () => void
  showBackButton?: boolean
}

type MessageItem = { type: 'raw'; data: RawMessage } | { type: 'temp'; data: TempMessage } | { type: 'system'; data: SystemTip }

const ChatWindow: React.FC<ChatWindowProps> = ({ session, onShowMembers, onNewMessageCallback, onEmojiReactionCallback, onMessageRecalledCallback, appendInputMention, onAppendInputMentionConsumed, onBack, showBackButton }) => {
  const [messages, setMessages] = useState<RawMessage[]>([])
  const [tempMessages, setTempMessages] = useState<TempMessage[]>([])
  const [systemTips, setSystemTips] = useState<SystemTip[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewVideoUrl, setPreviewVideoUrl] = useState<{ chatType: number; peerUid: string; msgId: string; elementId: string } | null>(null)
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: RawMessage; elementId?: string } | null>(null)
  const [avatarContextMenu, setAvatarContextMenu] = useState<AvatarContextMenuInfo | null>(null)
  const [userProfile, setUserProfile] = useState<{ profile: UserProfile | null; loading: boolean; position: { x: number; y: number } } | null>(null)
  const [groupProfile, setGroupProfile] = useState<{ profile: GroupProfile | null; loading: boolean; position: { x: number; y: number } } | null>(null)
  const [isScrollReady, setIsScrollReady] = useState(false)
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)
  const [kickConfirm, setKickConfirm] = useState<{ uid: string; name: string; groupCode: string; groupName: string } | null>(null)
  const [muteDialog, setMuteDialog] = useState<{ uid: string; name: string; groupCode: string } | null>(null)
  const [titleDialog, setTitleDialog] = useState<{ uid: string; name: string; groupCode: string } | null>(null)
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<{ message: RawMessage; x: number; y: number } | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  const imagePreviewContextValue = useMemo(() => ({
    showPreview: (url: string) => setPreviewImageUrl(url)
  }), [])

  const videoPreviewContextValue = useMemo(() => ({
    showPreview: (chatType: number, peerUid: string, msgId: string, elementId: string) =>
      setPreviewVideoUrl({ chatType, peerUid, msgId, elementId })
  }), [])

  const messageContextMenuValue = useMemo(() => ({
    showMenu: (e: React.MouseEvent, message: RawMessage) => {
      setContextMenu({ x: e.clientX, y: e.clientY, message })
    }
  }), [])

  const imageContextMenuValue = useMemo(() => ({
    showMenu: (e: React.MouseEvent, message: RawMessage, elementId: string) => {
      setContextMenu({ x: e.clientX, y: e.clientY, message, elementId })
    }
  }), [])

  const avatarContextMenuValue = useMemo(() => ({
    showMenu: (e: React.MouseEvent, info: Omit<AvatarContextMenuInfo, 'x' | 'y'>) => {
      setAvatarContextMenu({ x: e.clientX, y: e.clientY, ...info })
    }
  }), [])

  const { getCachedMembers, setCachedMembers, fetchGroupMembers, friendCategories } = useWebQQStore()

  const chatWindowRef = useRef<HTMLDivElement>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<any>(null)
  const sessionRef = useRef(session)
  const shouldScrollRef = useRef(true)
  const prevSessionKeyRef = useRef<string | null>(null)
  const allItemsRef = useRef<MessageItem[]>([])
  const messageCacheRef = useRef<Map<string, RawMessage[]>>(new Map())
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const isLoadingMoreRef = useRef(false)
  const scrollToMsgIdRef = useRef<string | null>(null)
  const isFirstMountRef = useRef(true)
  const loadVersionRef = useRef(0)  // 用于检查消息加载的版本
  const isLoadingInitialRef = useRef(false)  // 防止重复加载初始消息

  useEffect(() => { sessionRef.current = session }, [session])

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
    const systemItems: MessageItem[] = systemTips.map(tip => ({ type: 'system' as const, data: tip }))

    // 合并所有消息并按时间排序
    const items = [...rawItems, ...tempItems, ...systemItems]
    items.sort((a, b) => {
      const getTimestamp = (item: MessageItem): number => {
        if (item.type === 'raw') return parseInt(item.data.msgTime) * 1000
        if (item.type === 'temp') return item.data.timestamp
        return item.data.timestamp // system tip
      }
      return getTimestamp(a) - getTimestamp(b)
    })

    allItemsRef.current = items
    return items
  }, [messages, tempMessages, systemTips])

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  const scrollToMessage = useCallback((msgId: string, msgSeq?: string) => {
    const index = allItems.findIndex(item => {
      if (item.type !== 'raw') return false
      return item.data.msgId === msgId || (msgSeq && item.data.msgSeq === msgSeq)
    })
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: 'center' })
      const targetMsg = allItems[index]
      if (targetMsg.type === 'raw') {
        setHighlightMsgId(targetMsg.data.msgId)
        setTimeout(() => setHighlightMsgId(null), 2000)
      }
    }
  }, [allItems, virtualizer])

  const scrollToMessageContextValue = useMemo(() => ({ scrollToMessage }), [scrollToMessage])
  const groupMembersContextValue = useMemo(() => ({
    getMembers: (groupCode: string) => getCachedMembers(groupCode)
  }), [getCachedMembers])

  const friendsContextValue = useMemo(() => ({
    getFriend: (uin: string): FriendInfo | null => {
      for (const category of friendCategories) {
        const friend = category.friends.find(f => f.uin === uin)
        if (friend) {
          return {
            uid: friend.uid,
            uin: friend.uin,
            nickname: friend.nickname,
            remark: friend.remark
          }
        }
      }
      return null
    }
  }), [friendCategories])

  const scrollToBottom = useCallback(() => {
    if (allItemsRef.current.length > 0) {
      virtualizer.scrollToIndex(allItemsRef.current.length - 1, { align: 'end' })
    }
    const container = parentRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [virtualizer])

  const [needScrollToBottom, setNeedScrollToBottom] = useState(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomLockUntilRef = useRef(0)
  const bottomLockRafRef = useRef<number | null>(null)

  const stopBottomLock = useCallback(() => {
    if (bottomLockRafRef.current !== null) {
      cancelAnimationFrame(bottomLockRafRef.current)
      bottomLockRafRef.current = null
    }
  }, [])

  const startBottomLock = useCallback((durationMs: number = 800) => {
    bottomLockUntilRef.current = Date.now() + durationMs
    stopBottomLock()

    const tick = () => {
      if (Date.now() > bottomLockUntilRef.current) {
        bottomLockRafRef.current = null
        return
      }
      scrollToBottom()
      bottomLockRafRef.current = requestAnimationFrame(tick)
    }

    tick()
  }, [scrollToBottom, stopBottomLock])

  useEffect(() => {
    const currentKey = session ? `${session.chatType}_${session.peerId}` : null
    if (currentKey !== prevSessionKeyRef.current) {
      prevSessionKeyRef.current = currentKey
      setIsScrollReady(false)
      setNeedScrollToBottom(true)
    }
  }, [session?.chatType, session?.peerId])

  useEffect(() => {
    if (allItems.length === 0 || !needScrollToBottom) return
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      setNeedScrollToBottom(false)
      const scrollToEnd = () => virtualizer.scrollToIndex(allItems.length - 1, { align: 'end' })
      requestAnimationFrame(() => {
        scrollToEnd()
        setTimeout(scrollToEnd, 50)
        setTimeout(() => { scrollToEnd(); setIsScrollReady(true) }, 100)
      })
    }, 200)
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current) }
  }, [allItems.length, needScrollToBottom, virtualizer])

  useEffect(() => {
    return () => stopBottomLock()
  }, [stopBottomLock])

  useEffect(() => {
    if (shouldScrollRef.current && allItems.length > 0) {
      scrollToBottom()
      shouldScrollRef.current = false
    }
  }, [allItems.length, scrollToBottom])

  useEffect(() => {
    if (onNewMessageCallback) {
      const handleNewMessage = (msg: RawMessage) => {
        if (!msg || !msg.msgId || !msg.elements || !Array.isArray(msg.elements)) return

        // 检查是否是自己发送的消息
        const selfUid = getSelfUid()

        setMessages(prev => {
          if (prev.some(m => m && m.msgId === msg.msgId)) return prev
          const newMessages = [...prev, msg]
          const currentSession = sessionRef.current
          if (currentSession) appendCachedMessage(currentSession.chatType, currentSession.peerId, msg)
          return newMessages
        })

        // 注：临时消息已在 ChatInput.sendMessage 成功后立即移除，
        // SSE 消息达到时应该没有待移除的临时消息。此处保留防御性代码。
        // 在极端情况下（如快速重连），可能仍有未移除的临时消息，此时将其全部移除。
        if (msg.senderUid === selfUid) {
          setTempMessages(prev => {
            const sendingMsgs = prev.filter(t => t.status === 'sending')
            if (sendingMsgs.length === 0) return prev
            // 移除所有"发送中"状态的临时消息，因为此时收到了真实的消息，临时消息应该已清除
            console.warn(`[SSE] 收到自己的消息时，仍存在 ${sendingMsgs.length} 条临时消息，现已清除`, sendingMsgs)
            return prev.filter(t => t.status !== 'sending')
          })
        }
      }
      onNewMessageCallback(handleNewMessage)
    }
    return () => { if (onNewMessageCallback) onNewMessageCallback(null) }
  }, [onNewMessageCallback])

  // 处理表情回应事件
  useEffect(() => {
    if (onEmojiReactionCallback) {
      const handleEmojiReaction = (data: EmojiReactionData) => {
        const selfUin = getSelfUin()
        const isSelf = selfUin && data.userId === selfUin

        // 更新消息的表情列表
        setMessages(prev => prev.map(m => {
          if (m.msgSeq !== data.msgSeq) return m
          const existingList = m.emojiLikesList || []

          if (data.isAdd) {
            // 添加表情
            const existingIndex = existingList.findIndex(e => e.emojiId === data.emojiId)
            if (existingIndex >= 0) {
              const newList = [...existingList]
              newList[existingIndex] = {
                ...newList[existingIndex],
                likesCnt: String(parseInt(newList[existingIndex].likesCnt) + 1),
                // 如果是自己贴的，标记为已点击
                isClicked: newList[existingIndex].isClicked || isSelf
              }
              return { ...m, emojiLikesList: newList }
            } else {
              return {
                ...m,
                emojiLikesList: [...existingList, { emojiId: data.emojiId, emojiType: parseInt(data.emojiId) > 999 ? '2' : '1', likesCnt: '1', isClicked: isSelf }]
              }
            }
          } else {
            // 移除表情
            const existingIndex = existingList.findIndex(e => e.emojiId === data.emojiId)
            if (existingIndex >= 0) {
              const newList = [...existingList]
              const newCount = parseInt(newList[existingIndex].likesCnt) - 1
              if (newCount <= 0) {
                newList.splice(existingIndex, 1)
              } else {
                newList[existingIndex] = {
                  ...newList[existingIndex],
                  likesCnt: String(newCount),
                  // 如果是自己取消的，标记为未点击
                  isClicked: isSelf ? false : newList[existingIndex].isClicked
                }
              }
              return { ...m, emojiLikesList: newList }
            }
          }
          return m
        }))

        // 添加系统提示消息（只在添加表情时显示，且不是自己的回应）
        if (data.isAdd && !isSelf) {
          const tip: SystemTip = {
            id: `tip_${Date.now()}_${Math.random()}`,
            type: 'emoji-reaction',
            userName: data.userName,
            emojiId: data.emojiId,
            msgSeq: data.msgSeq,
            timestamp: Date.now()
          }
          setSystemTips(prev => [...prev, tip])
        }
      }
      onEmojiReactionCallback(handleEmojiReaction)
    }
    return () => { if (onEmojiReactionCallback) onEmojiReactionCallback(null) }
  }, [onEmojiReactionCallback])

  // 处理消息撤回事件
  useEffect(() => {
    if (onMessageRecalledCallback) {
      const handleMessageRecalled = (data: { msgId: string; msgSeq: string }) => {
        // 标记消息为已撤回（设置 recallTime）
        setMessages(prev => prev.map(m => {
          if (m.msgId === data.msgId || (data.msgSeq && m.msgSeq === data.msgSeq)) {
            return { ...m, recallTime: String(Math.floor(Date.now() / 1000)) }
          }
          return m
        }))
      }
      onMessageRecalledCallback(handleMessageRecalled)
    }
    return () => { if (onMessageRecalledCallback) onMessageRecalledCallback(null) }
  }, [onMessageRecalledCallback])

  const getSessionKey = (chatType: number | string, peerId: string) => `${chatType}_${peerId}`

  const loadMessages = useCallback(async (beforeMsgSeq?: string, afterMsgSeq?: string) => {
    if (!session) return
    const requestChatType = session.chatType
    const requestPeerId = session.peerId

    // 检查 session 是否仍然匹配
    const checkSession = () => {
      const currentSession = sessionRef.current
      return currentSession && currentSession.chatType === requestChatType && currentSession.peerId === requestPeerId
    }

    console.log('[ChatWindow] loadMessages called:', { chatType: requestChatType, peerId: requestPeerId, beforeMsgSeq, afterMsgSeq })

    if (beforeMsgSeq) setLoadingMore(true)
    else setLoading(true)

    if (beforeMsgSeq && messages.length > 0) scrollToMsgIdRef.current = messages[0]?.msgId || null

    try {
      const result = await getMessages(requestChatType, requestPeerId, beforeMsgSeq, 20, afterMsgSeq)

      console.log('[ChatWindow] API response:', { messagesCount: result.messages.length, hasMore: result.hasMore })

      // 检查 session 是否仍然匹配
      if (!checkSession()) {
        console.log('[ChatWindow] Session changed after API call, skipping')
        return
      }

      const validMessages = result.messages.filter((msg): msg is RawMessage =>
        msg !== null && msg !== undefined && msg.elements && Array.isArray(msg.elements)
      )

      console.log('[ChatWindow] Valid messages:', validMessages.length)

      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.msgId))
        const newMsgs = validMessages.filter(m => !existingIds.has(m.msgId))
        const merged = beforeMsgSeq ? [...newMsgs, ...prev] : [...prev, ...newMsgs]
        merged.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
        console.log('[ChatWindow] Merged messages:', merged.length, 'new:', newMsgs.length)
        setCachedMessages(requestChatType, requestPeerId, merged)
        return merged
      })
      setHasMore(result.hasMore)
      return { validMessages, hasMore: result.hasMore }
    } catch (e) {
      console.error('[ChatWindow] loadMessages error:', e)
      scrollToMsgIdRef.current = null
      if (!checkSession()) return
      showToast(beforeMsgSeq ? '加载更多消息失败' : '加载消息失败', 'error')
    } finally {
      if (checkSession()) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [session, messages])

  // 加载最新消息并尝试和本地缓存合并
  const loadMessagesAndMergeWithCache = useCallback(async (cachedMessages: RawMessage[]) => {
    if (!session) return
    const requestChatType = session.chatType
    const requestPeerId = session.peerId

    setLoading(true)

    // 检查 session 是否仍然匹配
    const checkSession = () => {
      const currentSession = sessionRef.current
      return currentSession && currentSession.chatType === requestChatType && currentSession.peerId === requestPeerId
    }

    try {
      // 1. 先加载最新 20 条消息
      const result = await getMessages(requestChatType, requestPeerId)

      if (!checkSession()) {
        console.log('[ChatWindow] Session changed during API call, skipping')
        return
      }

      const latestMessages = result.messages.filter((msg): msg is RawMessage =>
        msg !== null && msg !== undefined && msg.elements && Array.isArray(msg.elements)
      )

      console.log('[ChatWindow] Latest messages from API:', latestMessages.length)

      if (latestMessages.length === 0) {
        setHasMore(false)
        return
      }

      // 2. 检查是否和本地缓存有重叠
      const cachedMsgIds = new Set(cachedMessages.map(m => m.msgId))
      const hasOverlap = latestMessages.some(m => cachedMsgIds.has(m.msgId))

      if (hasOverlap || cachedMessages.length === 0) {
        // 有重叠或没有缓存，直接合并
        console.log('[ChatWindow] Has overlap with cache, merging directly')
        const merged = [...cachedMessages, ...latestMessages]
        const uniqueMessages = merged.filter((msg, index, arr) =>
          arr.findIndex(m => m.msgId === msg.msgId) === index
        )
        uniqueMessages.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
        setMessages(uniqueMessages)
        setCachedMessages(requestChatType, requestPeerId, uniqueMessages)
        setHasMore(result.hasMore)
      } else {
        // 没有重叠，需要继续向上拉取直到和缓存接上
        console.log('[ChatWindow] No overlap, need to fill gap')
        let allNewMessages = [...latestMessages]
        let currentBeforeMsgSeq = latestMessages[0]?.msgSeq
        let hasMore = result.hasMore
        const cachedLatestMsgSeq = cachedMessages[cachedMessages.length - 1]?.msgSeq

        // 最多尝试 10 次（200 条消息）来填补间隙
        for (let i = 0; i < 10 && hasMore; i++) {
          if (!checkSession()) {
            console.log('[ChatWindow] Session changed during gap fill, skipping')
            return
          }

          const moreResult = await getMessages(requestChatType, requestPeerId, currentBeforeMsgSeq)
          const moreMessages = moreResult.messages.filter((msg): msg is RawMessage =>
            msg !== null && msg !== undefined && msg.elements && Array.isArray(msg.elements)
          )

          if (moreMessages.length === 0) break

          allNewMessages = [...moreMessages, ...allNewMessages]
          currentBeforeMsgSeq = moreMessages[0]?.msgSeq
          hasMore = moreResult.hasMore

          // 检查是否和缓存接上了
          const newMsgIds = new Set(moreMessages.map(m => m.msgId))
          const connected = cachedMessages.some(m => newMsgIds.has(m.msgId)) ||
            (cachedLatestMsgSeq && moreMessages.some(m => parseInt(m.msgSeq) <= parseInt(cachedLatestMsgSeq)))

          if (connected) {
            console.log('[ChatWindow] Connected with cache after', i + 1, 'iterations')
            break
          }
        }

        // 合并所有消息
        const merged = [...cachedMessages, ...allNewMessages]
        const uniqueMessages = merged.filter((msg, index, arr) =>
          arr.findIndex(m => m.msgId === msg.msgId) === index
        )
        uniqueMessages.sort((a, b) => parseInt(a.msgTime) - parseInt(b.msgTime))
        setMessages(uniqueMessages)
        setCachedMessages(requestChatType, requestPeerId, uniqueMessages)
        setHasMore(hasMore)
      }
    } catch (e) {
      console.error('[ChatWindow] loadMessagesAndMergeWithCache error:', e)
      showToast('加载消息失败', 'error')
    } finally {
      if (checkSession()) {
        setLoading(false)
      }
    }
  }, [session])

  useEffect(() => {
    const targetMsgId = scrollToMsgIdRef.current
    if (targetMsgId && allItems.length > 0) {
      const targetIndex = allItems.findIndex(item => item.type === 'raw' && item.data.msgId === targetMsgId)
      if (targetIndex !== -1) virtualizer.scrollToIndex(targetIndex, { align: 'start' })
      scrollToMsgIdRef.current = null
    }
  }, [allItems, virtualizer])

  useEffect(() => {
    if (session) {
      // 切换会话时递增版本号，使旧的请求失效
      const currentVersion = ++loadVersionRef.current

      const sessionKey = getSessionKey(session.chatType, session.peerId)
      const currentChatType = session.chatType
      const currentPeerId = session.peerId

      console.log('[ChatWindow] Session changed:', { chatType: currentChatType, peerId: currentPeerId, version: currentVersion })

      // 重置加载状态
      isLoadingInitialRef.current = false

      // 先尝试从内存缓存读取
      const cachedInMemory = messageCacheRef.current.get(sessionKey)
      if (cachedInMemory && cachedInMemory.length > 0) {
        console.log('[ChatWindow] Memory cache hit:', cachedInMemory.length, 'messages')
        setMessages(cachedInMemory)
      } else {
        console.log('[ChatWindow] Memory cache miss')
        setMessages([])
      }

      setTempMessages([])
      setSystemTips([])
      shouldScrollRef.current = true

      // 首次挂载或未访问过的聊天，从 API 加载最新消息
      const isFirstMount = isFirstMountRef.current
      const hasVisited = hasVisitedChat(currentChatType, currentPeerId)
      const shouldLoadFromApi = isFirstMount || !hasVisited
      console.log('[ChatWindow] Check load:', { isFirstMount, hasVisited, shouldLoadFromApi })

      // 从 IndexedDB 读取缓存，然后从 API 加载最新消息
      getCachedMessages(currentChatType, currentPeerId).then(async cachedMessages => {
        // 只检查 session 是否匹配，不检查版本号（因为版本号可能因为 SSE 重连而变化）
        const currentSession = sessionRef.current
        if (!currentSession || currentSession.chatType !== currentChatType || currentSession.peerId !== currentPeerId) {
          console.log('[ChatWindow] Session changed after IndexedDB read, skipping')
          return
        }

        // 获取有效的缓存消息
        let validCachedMessages: RawMessage[] = []
        if (cachedMessages && cachedMessages.length > 0) {
          validCachedMessages = cachedMessages.filter(m => m.elements && Array.isArray(m.elements))
          console.log('[ChatWindow] IndexedDB cache hit:', validCachedMessages.length, 'valid messages')
          if (validCachedMessages.length > 0) {
            messageCacheRef.current.set(sessionKey, validCachedMessages)
            // 始终使用 IndexedDB 缓存，因为它可能包含 SSE 推送的新消息
            setMessages(validCachedMessages)
          }
        } else {
          console.log('[ChatWindow] IndexedDB cache miss')
        }

        // 防止重复加载
        if (shouldLoadFromApi && !isLoadingInitialRef.current) {
          isLoadingInitialRef.current = true
          isFirstMountRef.current = false
          markChatVisited(currentChatType, currentPeerId)
          console.log('[ChatWindow] Calling loadMessagesAndMergeWithCache()')

          // 加载最新消息，然后尝试和本地缓存合并
          await loadMessagesAndMergeWithCache(validCachedMessages)
        }
      })
    } else {
      setMessages([])
      setTempMessages([])
      setSystemTips([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.peerId, session?.chatType])

  useEffect(() => {
    if (session && messages.length > 0) {
      const sessionKey = getSessionKey(session.chatType, session.peerId)
      messageCacheRef.current.set(sessionKey, messages)
    }
  }, [messages, session?.chatType, session?.peerId])

  useEffect(() => {
    const sentinel = topSentinelRef.current
    const container = parentRef.current
    if (!sentinel || !container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        // 首次加载中不触发加载更多
        if (entry.isIntersecting && hasMore && !isLoadingMoreRef.current && !loading && messages.length > 0) {
          const firstMsgSeq = messages[0]?.msgSeq
          if (firstMsgSeq) {
            isLoadingMoreRef.current = true
            loadMessages(firstMsgSeq).finally(() => { isLoadingMoreRef.current = false })
          }
        }
      },
      { root: container, rootMargin: '50px 0px 0px 0px', threshold: 0 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, messages, loadMessages])

  const handleScroll = useCallback(() => {
    const container = parentRef.current
    if (!container || messages.length === 0) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    shouldScrollRef.current = isNearBottom
    setShowScrollToBottom(!isNearBottom)
  }, [messages])

  const handleRetryTemp = useCallback((tempMsg: TempMessage) => {
    setTempMessages(prev => prev.filter(t => t.msgId !== tempMsg.msgId))
  }, [])

  const handleShowProfile = useCallback(async (uid: string, uin: string, x: number, y: number, groupCode?: string) => {
    setUserProfile({ profile: null, loading: true, position: { x, y } })
    try {
      const profile = await getUserProfile(uid, uin, groupCode)
      setUserProfile({ profile, loading: false, position: { x, y } })
    } catch {
      setUserProfile(null)
      showToast('获取用户资料失败', 'error')
    }
  }, [])

  const handleTempMessage = useCallback((msg: TempMessage) => {
    setTempMessages(prev => [...prev, msg])
    shouldScrollRef.current = true
  }, [])

  const handleSendStart = useCallback(() => {
    shouldScrollRef.current = true
    setShowScrollToBottom(false)
    startBottomLock(900)
  }, [startBottomLock])

  const handleSendEnd = useCallback(() => {
    shouldScrollRef.current = true
    startBottomLock(1400)
  }, [startBottomLock])

  const handleTempMessageRemove = useCallback((msgId: string) => {
    setTempMessages(prev => prev.filter(t => t.msgId !== msgId))
  }, [])

  const handleTempMessageFail = useCallback((msgId: string) => {
    setTempMessages(prev => prev.map(t => t.msgId === msgId ? { ...t, status: 'failed' as const } : t))
  }, [])

  useEffect(() => {
    if (!appendInputMention) return
    chatInputRef.current?.insertAt?.(appendInputMention.uid, appendInputMention.uin, appendInputMention.name)
    chatInputRef.current?.focus?.()
    onAppendInputMentionConsumed?.()
  }, [appendInputMention, onAppendInputMentionConsumed])

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center bg-theme-item">
        <div className="text-center text-theme-hint">
          <div className="text-6xl mb-4">💬</div>
          <p>选择一个联系人开始聊天</p>
        </div>
      </div>
    )
  }

  return (
    <ImagePreviewContext.Provider value={imagePreviewContextValue}>
    <VideoPreviewContext.Provider value={videoPreviewContextValue}>
    <ImageContextMenuContext.Provider value={imageContextMenuValue}>
    <MessageContextMenuContext.Provider value={messageContextMenuValue}>
    <AvatarContextMenuContext.Provider value={avatarContextMenuValue}>
    <ScrollToMessageContext.Provider value={scrollToMessageContextValue}>
    <GroupMembersContext.Provider value={groupMembersContextValue}>
    <FriendsContext.Provider value={friendsContextValue}>
      <div ref={chatWindowRef} className="flex flex-col h-full relative">
        {/* 头部 */}
        <div className="flex items-center justify-between px-2 md:px-4 py-3 border-b border-theme-divider bg-theme-card">
          {/* 返回按钮（移动端） */}
          {showBackButton && (
            <button
              onClick={onBack}
              className="p-2 mr-1 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors md:hidden"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity flex-1 min-w-0"
            onClick={async (e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = rect.left
              const y = rect.bottom + 8

              if (session.chatType === 2) {
                setGroupProfile({ profile: null, loading: true, position: { x, y } })
                try {
                  const profile = await getGroupProfile(session.peerId)
                  setGroupProfile({ profile, loading: false, position: { x, y } })
                } catch {
                  setGroupProfile(null)
                  showToast('获取群资料失败', 'error')
                }
              } else {
                setUserProfile({ profile: null, loading: true, position: { x, y } })
                try {
                  const { friendCategories } = useWebQQStore.getState()
                  let uid = ''
                  for (const category of friendCategories) {
                    const friend = category.friends.find(f => f.uin === session.peerId)
                    if (friend) { uid = friend.uid; break }
                  }
                  const profile = await getUserProfile(uid || undefined, session.peerId)
                  setUserProfile({ profile, loading: false, position: { x, y } })
                } catch {
                  setUserProfile(null)
                  showToast('获取用户资料失败', 'error')
                }
              }
            }}
          >
            <img src={session.peerAvatar} alt={session.peerName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-theme truncate">
                {(() => {
                  const { groups, friendCategories } = useWebQQStore.getState()
                  if (session.chatType === 2) {
                    const group = groups.find(g => g.groupCode === session.peerId)
                    if (group?.remarkName && group.remarkName !== group.groupName) {
                      return `${group.remarkName}(${group.groupName})`
                    }
                  } else {
                    for (const category of friendCategories) {
                      const friend = category.friends.find(f => f.uin === session.peerId)
                      if (friend?.remark && friend.remark !== friend.nickname) {
                        return `${friend.remark}(${friend.nickname})`
                      }
                    }
                  }
                  return session.peerName
                })()}
              </div>
              <div className="text-xs text-theme-hint">
                {session.chatType === 2 ? (() => {
                  const { groups } = useWebQQStore.getState()
                  const group = groups.find(g => g.groupCode === session.peerId)
                  return `群聊 ${session.peerId}${group?.memberCount ? ` · ${group.memberCount}人` : ''}`
                })() : session.chatType === 100 ? `临时会话 ${session.peerId}` : `私聊 ${session.peerId}`}
              </div>
            </div>
          </div>
          {session.chatType === 2 && onShowMembers && (
            <button onClick={onShowMembers} className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg" title="查看群成员">
              <Users size={20} />
            </button>
          )}
        </div>

        {/* 消息列表 */}
        <div ref={parentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div ref={topSentinelRef} className="h-1" />
          {loadingMore && <div className="flex justify-center py-2"><Loader2 size={20} className="animate-spin text-pink-500" /></div>}
          {loading ? (
            <div className="flex items-center justify-center h-full"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
          ) : allItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-theme-hint">暂无消息</div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative', opacity: isScrollReady ? 1 : 0 }} className="overflow-hidden">
              {virtualizer.getVirtualItems().map(virtualRow => {
                const item = allItems[virtualRow.index]
                return (
                  <div key={virtualRow.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, padding: '8px 0' }} data-index={virtualRow.index} ref={virtualizer.measureElement} className="overflow-hidden box-border">
                    {item.type === 'raw' ? (
                      <RawMessageBubble message={item.data} allMessages={messages} isHighlighted={highlightMsgId === item.data.msgId} />
                    ) : item.type === 'temp' ? (
                      <TempMessageBubble message={item.data as TempMessage} onRetry={() => handleRetryTemp(item.data as TempMessage)} />
                    ) : (
                      <EmojiReactionTip tip={item.data as SystemTip} onScrollToMessage={(msgSeq) => scrollToMessage('', msgSeq)} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>

        {/* 滚动到底部按钮 */}
        {showScrollToBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-[6.5rem] right-4 w-6 h-6 bg-theme-card/90 border border-theme-divider rounded-full shadow-md flex items-center justify-center text-theme-muted hover:text-theme hover:bg-theme-item transition-all z-10"
            title="滚动到底部"
          >
            <ArrowDown size={12} />
          </button>
        )}

        {/* 输入区域 */}
        <ChatInput
          ref={chatInputRef}
          session={session}
          replyTo={replyTo}
          onReplyCancel={() => setReplyTo(null)}
          onSendStart={handleSendStart}
          onSendEnd={handleSendEnd}
          onTempMessage={handleTempMessage}
          onTempMessageRemove={handleTempMessageRemove}
          onTempMessageFail={handleTempMessageFail}
        />
      </div>

      {/* 消息右键菜单 */}
      {contextMenu && (
        <MessageContextMenu
          contextMenu={contextMenu}
          session={session}
          getCachedMembers={getCachedMembers}
          onClose={() => setContextMenu(null)}
          onReply={(msg) => { setReplyTo(msg); setTimeout(() => chatInputRef.current?.focus?.(), 50) }}
          onEmojiReaction={(msg, x, y) => setEmojiPickerTarget({ message: msg, x, y })}
          onRecall={(msgId) => {
            setMessages(prev => prev.filter(m => m.msgId !== msgId))
            if (session) {
              const sessionKey = `${session.chatType}_${session.peerId}`
              const cached = messageCacheRef.current.get(sessionKey)
              if (cached) messageCacheRef.current.set(sessionKey, cached.filter(m => m.msgId !== msgId))
              removeCachedMessage(session.chatType, session.peerId, msgId)
            }
          }}
        />
      )}

      {/* 表情贴选择器 */}
      {emojiPickerTarget && (
        <EmojiReactionPicker
          target={emojiPickerTarget}
          onClose={() => setEmojiPickerTarget(null)}
          containerRef={chatWindowRef}
        />
      )}

      {/* 头像右键菜单 */}
      {avatarContextMenu && (
        <AvatarContextMenu
          avatarContextMenu={avatarContextMenu}
          getCachedMembers={getCachedMembers}
          onClose={() => setAvatarContextMenu(null)}
          onInsertAt={(uid, uin, name) => chatInputRef.current?.insertAt?.(uid, uin, name)}
          onShowProfile={handleShowProfile}
          onSetTitle={(uid, name, groupCode) => setTitleDialog({ uid, name, groupCode })}
          onMute={(uid, name, groupCode) => setMuteDialog({ uid, name, groupCode })}
          onKick={(uid, name, groupCode, groupName) => setKickConfirm({ uid, name, groupCode, groupName })}
          onAdminChanged={() => session && fetchGroupMembers(session.peerId, true)}
          groupName={session?.peerName}
        />
      )}

      {/* 用户资料卡 */}
      {userProfile && (
        <UserProfileCard
          profile={userProfile.profile}
          loading={userProfile.loading}
          position={userProfile.position}
          onClose={() => setUserProfile(null)}
          isFriend={session?.chatType === 1}
          onFriendDeleted={(uid) => {
            const { removeFriend, setCurrentChat, removeRecentChat } = useWebQQStore.getState()
            removeFriend(uid)
            // 如果当前聊天是被删除的好友，关闭聊天窗口
            if (session?.chatType === 1) {
              setCurrentChat(null)
              removeRecentChat(1, session.peerId)
            }
          }}
        />
      )}

      {/* 群资料卡 */}
      {groupProfile && (
        <GroupProfileCard
          profile={groupProfile.profile}
          loading={groupProfile.loading}
          position={groupProfile.position}
          onClose={() => setGroupProfile(null)}
          onQuitGroup={async (groupCode, isOwner) => {
            try {
              await quitGroup(groupCode)
              showToast(isOwner ? '群已解散' : '已退出群聊', 'success')
              const { setCurrentChat, removeRecentChat } = useWebQQStore.getState()
              setCurrentChat(null)
              removeRecentChat(2, groupCode)
            } catch (e) {
              showToast(e.message || (isOwner ? '解散失败' : '退群失败'), 'error')
            }
          }}
        />
      )}

      {/* 踢出群确认对话框 */}
      {kickConfirm && (
        <KickConfirmDialog
          name={kickConfirm.name}
          groupName={kickConfirm.groupName}
          onConfirm={async () => {
            const { uid, name, groupCode } = kickConfirm
            setKickConfirm(null)
            try {
              await kickGroupMember(groupCode, uid)
              showToast(`已将 ${name} 移出群聊`, 'success')
            } catch (e) {
              showToast(e.message || '踢出失败', 'error')
            }
          }}
          onClose={() => setKickConfirm(null)}
        />
      )}

      {/* 禁言时长选择对话框 */}
      {muteDialog && (
        <MuteDialog
          name={muteDialog.name}
          onMute={async (seconds) => {
            const { uid, name, groupCode } = muteDialog
            setMuteDialog(null)
            try {
              await muteGroupMember(groupCode, uid, seconds)
              if (seconds === 0) {
                showToast(`已解除 ${name} 的禁言`, 'success')
              } else {
                const display = seconds >= 86400 ? `${Math.floor(seconds / 86400)}天` :
                  seconds >= 3600 ? `${Math.floor(seconds / 3600)}小时` :
                  seconds >= 60 ? `${Math.floor(seconds / 60)}分钟` : `${seconds}秒`
                showToast(`已禁言 ${name} ${display}`, 'success')
              }
            } catch (e) {
              showToast(e.message || '禁言失败', 'error')
            }
          }}
          onClose={() => setMuteDialog(null)}
        />
      )}

      {/* 设置头衔对话框 */}
      {titleDialog && (
        <TitleDialog
          name={titleDialog.name}
          onConfirm={async (title) => {
            const { uid, name, groupCode } = titleDialog
            setTitleDialog(null)
            try {
              await setMemberTitle(groupCode, uid, title)
              showToast(title ? `已设置 ${name} 的头衔为「${title}」` : `已清除 ${name} 的头衔`, 'success')
            } catch (err) {
              showToast(err.message || '设置头衔失败', 'error')
            }
          }}
          onClose={() => setTitleDialog(null)}
        />
      )}

      <ImagePreviewModal url={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
      <VideoPreviewModal videoInfo={previewVideoUrl} onClose={() => setPreviewVideoUrl(null)} />
    </FriendsContext.Provider>
    </GroupMembersContext.Provider>
    </ScrollToMessageContext.Provider>
    </AvatarContextMenuContext.Provider>
    </MessageContextMenuContext.Provider>
    </ImageContextMenuContext.Provider>
    </VideoPreviewContext.Provider>
    </ImagePreviewContext.Provider>
  )
}

export default ChatWindow
