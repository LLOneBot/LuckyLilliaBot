import React, { useEffect, useCallback, useState } from 'react'
import ContactList from './contact/ContactList'
import ChatWindow from './ChatWindow'
import GroupMemberPanel from './contact/GroupMemberPanel'
import type { ChatSession, FriendItem, GroupItem, RecentChatItem, RawMessage } from '../../types/webqq'
import { createEventSource, getLoginInfo } from '../../utils/webqqApi'
import { useWebQQStore, resetVisitedChats } from '../../stores/webqqStore'
import { appendCachedMessage, updateCachedMessageEmojiReaction, markCachedMessageAsRecalled } from '../../utils/messageDb'
import { showToast } from '../common'
import { Loader2, Maximize2 } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

// 从原始消息中提取摘要
function extractMessageSummary(rawMessage: RawMessage): string {
  if (!rawMessage || !rawMessage.elements || !Array.isArray(rawMessage.elements)) {
    return '[消息]'
  }

  const summaryParts: string[] = []
  for (const element of rawMessage.elements) {
    if (element.textElement?.content) {
      summaryParts.push(element.textElement.content)
      continue
    }
    if (element.picElement) {
      summaryParts.push('[图片]')
      continue
    }
    if (element.faceElement) {
      summaryParts.push('[表情]')
      continue
    }
    if (element.fileElement) {
      summaryParts.push('[文件]')
      continue
    }
    if (element.pttElement) {
      summaryParts.push('[语音]')
      continue
    }
    if (element.videoElement) {
      summaryParts.push('[视频]')
      continue
    }
    if (element.replyElement) {
      summaryParts.push('[回复]')
      continue
    }
  }

  const summary = summaryParts.join('').replace(/\s+/g, ' ').trim()
  if (!summary) {
    return '[消息]'
  }

  // 纯 @ 提及时补充提示，避免预览显得过于突兀
  if (/^@[^\s]+$/.test(summary)) {
    return `${summary} [提及]`
  }

  return summary
}

const WebQQPage: React.FC<{ isFullscreen?: boolean }> = ({ isFullscreen = false }) => {
  // 使用 ref 直接存储回调，避免 state 更新的异步问题
  const onNewMessageRef = React.useRef<((msg: RawMessage) => void) | null>(null)
  const onEmojiReactionRef = React.useRef<((data: { groupCode: string; msgSeq: string; emojiId: string; userId: string; userName: string; isAdd: boolean }) => void) | null>(null)
  const onMessageRecalledRef = React.useRef<((data: { msgId: string; msgSeq: string }) => void) | null>(null)
  // 消息队列：缓存在回调未就绪时收到的消息
  const pendingMessagesRef = React.useRef<RawMessage[]>([])
  
  // 用于触发重新渲染的 state（当回调被设置时）
  const [, forceUpdate] = React.useState(0)

  const { showWebQQFullscreenButton } = useSettingsStore()

  const {
    friendCategories,
    groups,
    contactsLoading,
    contactsError,
    currentChat,
    activeTab,
    unreadCounts,
    showMemberPanel,
    setCurrentChat,
    setActiveTab,
    setShowMemberPanel,
    clearUnreadCount,
    incrementUnreadCount,
    updateRecentChat,
    loadContacts,
    setRecentChats
  } = useWebQQStore()
  
  // 单独订阅 recentChats 以确保更新时触发重新渲染
  const recentChats = useWebQQStore(state => state.recentChats)

  // 用于从群成员面板 @ 成员
  const [appendInputMention, setAppendInputMention] = React.useState<{ uid: string; uin: string; name: string } | null>(null)

  const handleAtMember = useCallback((member: { uid: string; uin: string; name: string }) => {
    setAppendInputMention(member)
  }, [])

  const handleAppendInputMentionConsumed = useCallback(() => {
    setAppendInputMention(null)
  }, [])

  useEffect(() => {
    // 每次进入 WebQQ 页面时重置已访问聊天记录
    resetVisitedChats()
    getLoginInfo().catch(e => console.error('获取登录信息失败:', e))
    loadContacts()
  }, [loadContacts])

  useEffect(() => {
    if (contactsError) {
      showToast(contactsError, 'error')
    }
  }, [contactsError])

  const currentChatRef = React.useRef(currentChat)
  
  useEffect(() => {
    currentChatRef.current = currentChat
  }, [currentChat])
  
  // 回调设置函数 - 直接更新 ref 并处理待处理消息
  const handleSetNewMessageCallback = React.useCallback((callback: ((msg: RawMessage) => void) | null) => {
    onNewMessageRef.current = callback
    
    // 当回调就绪时，处理队列中的待处理消息
    if (callback && pendingMessagesRef.current.length > 0) {
      const messages = [...pendingMessagesRef.current]
      pendingMessagesRef.current = []
      messages.forEach(msg => callback(msg))
    }
    
    forceUpdate(n => n + 1)
  }, [])
  
  // 表情回应回调设置函数
  const handleSetEmojiReactionCallback = React.useCallback((callback: ((data: { groupCode: string; msgSeq: string; emojiId: string; userId: string; userName: string; isAdd: boolean }) => void) | null) => {
    onEmojiReactionRef.current = callback
  }, [])
  
  // 消息撤回回调设置函数
  const handleSetMessageRecalledCallback = React.useCallback((callback: ((data: { msgId: string; msgSeq: string }) => void) | null) => {
    onMessageRecalledRef.current = callback
  }, [])
  
  useEffect(() => {
    const eventSource = createEventSource(
      (data) => {
        if (data.type === 'message-created' || data.type === 'message-sent') {
          const rawMessage: RawMessage = data.data
          
          // 验证消息有效性
          if (!rawMessage || !rawMessage.msgId || !rawMessage.elements || !Array.isArray(rawMessage.elements)) {
            console.warn('SSE 收到无效消息:', rawMessage)
            return
          }
          
          const chatType = rawMessage.chatType as 1 | 2 | 100
          // peerUin 可能为空，优先用 peerUin，否则用 peerUid
          const peerId = rawMessage.peerUin || rawMessage.peerUid
          const chatKey = `${chatType}_${peerId}`
          const chat = currentChatRef.current
          
          // 无论是否匹配当前聊天，都要缓存消息
          appendCachedMessage(chatType, peerId, rawMessage)
          
          if (chat && chat.chatType === chatType && chat.peerId === peerId) {
            if (onNewMessageRef.current) {
              onNewMessageRef.current(rawMessage)
            } else {
              // 回调未就绪，加入待处理队列
              pendingMessagesRef.current.push(rawMessage)
            }
          } else {
            incrementUnreadCount(chatKey)
          }
          
          const lastMessage = extractMessageSummary(rawMessage)
          
          // 提取发送者信息用于创建新会话
          let peerName: string | undefined
          let peerAvatar: string | undefined
          
          if (chatType === 2) {
            // 群聊使用群名称
            peerName = rawMessage.peerName || undefined
            peerAvatar = `https://p.qlogo.cn/gh/${peerId}/${peerId}/640/`
          } else {
            // 私聊和临时会话使用发送者信息
            peerName = rawMessage.sendNickName || rawMessage.sendMemberName || undefined
            peerAvatar = `https://q1.qlogo.cn/g?b=qq&nk=${peerId}&s=640`
          }
          
          updateRecentChat(chatType, peerId, lastMessage, parseInt(rawMessage.msgTime) * 1000, peerName, peerAvatar)
        } else if (data.type === 'emoji-reaction') {
          // 处理表情回应事件
          const { groupCode, msgSeq, emojiId, userId, userName, isAdd } = data.data
          const chat = currentChatRef.current
          
          // 更新本地缓存
          updateCachedMessageEmojiReaction(2, groupCode, msgSeq, emojiId, isAdd)
          
          // 只有当前聊天是该群时才更新 UI
          if (chat && chat.chatType === 2 && chat.peerId === groupCode) {
            if (onEmojiReactionRef.current) {
              onEmojiReactionRef.current({ groupCode, msgSeq, emojiId, userId, userName, isAdd })
            }
          }
        } else if (data.type === 'message-deleted') {
          // 处理消息撤回事件
          const { msgId, msgSeq, chatType, peerUid, peerUin } = data.data
          const peerId = peerUin || peerUid
          const chat = currentChatRef.current
          
          // 更新本地缓存
          markCachedMessageAsRecalled(chatType, peerId, msgId, msgSeq)
          
          // 只有当前聊天匹配时才更新 UI
          if (chat && chat.chatType === chatType && chat.peerId === peerId) {
            if (onMessageRecalledRef.current) {
              onMessageRecalledRef.current({ msgId, msgSeq })
            }
          }
        }
      },
      (error) => {
        console.error('SSE 连接错误:', error)
      },
      () => {
        // SSE 重连成功回调
        console.log('[WebQQ] SSE 重连成功，重置已访问聊天标志')
        // 重置已访问聊天记录，这样下次进入聊天会重新拉取历史消息
        resetVisitedChats()
        // 刷新联系人列表
        loadContacts()
      }
    )

    return () => {
      eventSource.close()
    }
  }, [incrementUnreadCount, updateRecentChat, loadContacts])

  const handleSelectChat = useCallback((session: ChatSession) => {
    // 切换聊天时清空待处理消息队列
    pendingMessagesRef.current = []
    
    setCurrentChat(session)
    if (session.chatType !== 2) {
      setShowMemberPanel(false)
    }
    
    const chatKey = `${session.chatType}_${session.peerId}`
    clearUnreadCount(chatKey)
    
    setRecentChats(recentChats.map(item => {
      if (item.chatType === session.chatType && item.peerId === session.peerId) {
        return { ...item, unreadCount: 0 }
      }
      return item
    }))
  }, [setCurrentChat, clearUnreadCount, setRecentChats, recentChats, setShowMemberPanel])

  // 移动端：是否显示聊天窗口（隐藏联系人列表）
  const [showChatOnMobile, setShowChatOnMobile] = useState(false)
  
  // 移动端选择聊天后显示聊天窗口
  const handleSelectChatMobile = useCallback((session: ChatSession) => {
    handleSelectChat(session)
    setShowChatOnMobile(true)
  }, [handleSelectChat])
  
  // 移动端返回联系人列表
  const handleBackToContacts = useCallback(() => {
    setShowChatOnMobile(false)
  }, [])

  const handleSelectFriend = useCallback((friend: FriendItem) => {
    const session = {
      chatType: 1 as const,
      peerId: friend.uin,
      peerName: friend.remark || friend.nickname,
      peerAvatar: friend.avatar
    }
    handleSelectChatMobile(session)
  }, [handleSelectChatMobile])

  const handleSelectGroup = useCallback((group: GroupItem) => {
    const session = {
      chatType: 2 as const,
      peerId: group.groupCode,
      peerName: group.groupName,
      peerAvatar: group.avatar
    }
    handleSelectChatMobile(session)
  }, [handleSelectChatMobile])

  const handleSelectRecent = useCallback((recent: RecentChatItem) => {
    const session = {
      chatType: recent.chatType,
      peerId: recent.peerId,
      peerName: recent.peerName,
      peerAvatar: recent.peerAvatar
    }
    handleSelectChatMobile(session)
  }, [handleSelectChatMobile])

  const unreadCountsMap = React.useMemo(() => {
    return new Map(Object.entries(unreadCounts))
  }, [unreadCounts])

  const showLoading = contactsLoading && friendCategories.length === 0 && groups.length === 0

  if (showLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 size={48} className="animate-spin text-pink-500" />
      </div>
    )
  }

  if (contactsError && friendCategories.length === 0 && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <p className="text-red-500">{contactsError}</p>
        <button onClick={() => loadContacts()} className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
          重试
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-[calc(100vh-80px)] md:h-[calc(100vh-120px)] bg-theme-card backdrop-blur-xl rounded-none md:rounded-2xl overflow-hidden shadow-xl border border-theme">
        {/* 联系人列表 - 移动端全屏，桌面端固定宽度 */}
        <div className={`
          w-full md:w-72 border-r border-theme-divider flex-shrink-0
          ${showChatOnMobile ? 'hidden md:block' : 'block'}
        `}>
          <ContactList
            activeTab={activeTab}
            onTabChange={setActiveTab}
            friendCategories={friendCategories}
            groups={groups}
            recentChats={recentChats}
            unreadCounts={unreadCountsMap}
            selectedPeerId={currentChat?.peerId}
            onSelectFriend={handleSelectFriend}
            onSelectGroup={handleSelectGroup}
            onSelectRecent={handleSelectRecent}
          />
        </div>

        {/* 聊天窗口 - 移动端全屏，桌面端自适应 */}
        <div className={`
          flex-1 flex flex-col min-w-0
          ${showChatOnMobile ? 'block' : 'hidden md:flex'}
        `}>
          <ChatWindow
            session={currentChat}
            onShowMembers={() => setShowMemberPanel(!showMemberPanel)}
            onNewMessageCallback={handleSetNewMessageCallback}
            onEmojiReactionCallback={handleSetEmojiReactionCallback}
            onMessageRecalledCallback={handleSetMessageRecalledCallback}
            appendInputMention={appendInputMention}
            onAppendInputMentionConsumed={handleAppendInputMentionConsumed}
            onBack={handleBackToContacts}
            showBackButton={showChatOnMobile}
          />
        </div>

        {/* 群成员面板 - 桌面端侧边栏，移动端全屏覆盖 */}
        {showMemberPanel && currentChat?.chatType === 2 && (
          <div className="fixed inset-0 z-50 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl md:static md:inset-auto md:z-auto md:bg-transparent md:backdrop-blur-none md:w-64 md:border-l md:border-theme-divider md:flex-shrink-0">
            <GroupMemberPanel 
              groupCode={currentChat.peerId} 
              onClose={() => setShowMemberPanel(false)} 
              onAtMember={handleAtMember}
            />
          </div>
        )}
      </div>

      {/* 全屏按钮 - 固定在浏览器窗口右下角，仅在非全屏模式且设置开启时显示 */}
      {!isFullscreen && showWebQQFullscreenButton && (
        <button
          onClick={() => window.open('#webqq-fullscreen', '_blank')}
          className="fixed top-4 right-4 md:top-auto md:bottom-6 md:right-6 z-50 p-3 bg-pink-500/70 hover:bg-pink-500/90 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 group backdrop-blur-sm"
          title="在新窗口中全屏打开"
        >
          <Maximize2 size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      )}
    </>
  )
}

export default WebQQPage
