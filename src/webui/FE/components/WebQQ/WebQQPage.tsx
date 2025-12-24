import React, { useEffect, useCallback } from 'react'
import ContactList from './ContactList'
import ChatWindow from './ChatWindow'
import GroupMemberPanel from './GroupMemberPanel'
import type { ChatSession, FriendItem, GroupItem, RecentChatItem, RawMessage } from '../../types/webqq'
import { createEventSource, getLoginInfo } from '../../utils/webqqApi'
import { useWebQQStore, resetVisitedChats } from '../../stores/webqqStore'
import { showToast } from '../Toast'
import { Loader2 } from 'lucide-react'

// 从原始消息中提取摘要
function extractMessageSummary(rawMessage: RawMessage): string {
  if (!rawMessage || !rawMessage.elements || !Array.isArray(rawMessage.elements)) {
    return '[消息]'
  }
  for (const element of rawMessage.elements) {
    if (element.textElement) {
      return element.textElement.content
    }
    if (element.picElement) {
      return '[图片]'
    }
    if (element.faceElement) {
      return '[表情]'
    }
    if (element.fileElement) {
      return '[文件]'
    }
    if (element.pttElement) {
      return '[语音]'
    }
    if (element.videoElement) {
      return '[视频]'
    }
  }
  return '[消息]'
}

const WebQQPage: React.FC = () => {
  // 使用 ref 直接存储回调，避免 state 更新的异步问题
  const onNewMessageRef = React.useRef<((msg: RawMessage) => void) | null>(null)
  // 消息队列：缓存在回调未就绪时收到的消息
  const pendingMessagesRef = React.useRef<RawMessage[]>([])
  
  // 用于触发重新渲染的 state（当回调被设置时）
  const [, forceUpdate] = React.useState(0)

  const {
    friendCategories,
    groups,
    recentChats,
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
    setRecentChats,
    appendCachedMessage
  } = useWebQQStore()

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
    console.log('WebQQPage: 设置新消息回调', callback ? '有效' : 'null')
    onNewMessageRef.current = callback
    
    // 当回调就绪时，处理队列中的待处理消息
    if (callback && pendingMessagesRef.current.length > 0) {
      console.log('处理待处理消息队列:', pendingMessagesRef.current.length, '条')
      const messages = [...pendingMessagesRef.current]
      pendingMessagesRef.current = []
      messages.forEach(msg => callback(msg))
    }
    
    forceUpdate(n => n + 1)
  }, [])
  
  useEffect(() => {
    const eventSource = createEventSource(
      (data) => {
        console.log('SSE 收到原始数据:', data)
        
        if (data.type === 'message-created' || data.type === 'message-sent') {
          const rawMessage: RawMessage = data.data
          
          // 验证消息有效性
          if (!rawMessage || !rawMessage.msgId || !rawMessage.elements || !Array.isArray(rawMessage.elements)) {
            console.warn('SSE 收到无效消息:', rawMessage)
            return
          }
          
          const chatType = rawMessage.chatType === 1 ? 'friend' : 'group'
          // peerUin 可能为空，优先用 peerUin，否则用 peerUid
          const peerId = rawMessage.peerUin || rawMessage.peerUid
          const chatKey = `${chatType}_${peerId}`
          const chat = currentChatRef.current
          
          console.log('SSE 消息匹配:', { 
            msgChatType: chatType, 
            msgPeerId: peerId,
            peerUin: rawMessage.peerUin,
            peerUid: rawMessage.peerUid,
            currentChatType: chat?.chatType, 
            currentPeerId: chat?.peerId,
            isMatch: chat && chat.chatType === chatType && chat.peerId === peerId,
            hasCallback: !!onNewMessageRef.current
          })
          
          // 无论是否匹配当前聊天，都要缓存消息
          appendCachedMessage(chatType, peerId, rawMessage)
          
          if (chat && chat.chatType === chatType && chat.peerId === peerId) {
            console.log('SSE 消息匹配成功，通知 ChatWindow')
            if (onNewMessageRef.current) {
              onNewMessageRef.current(rawMessage)
            } else {
              // 回调未就绪，加入待处理队列
              console.log('回调未就绪，加入待处理队列')
              pendingMessagesRef.current.push(rawMessage)
            }
          } else {
            incrementUnreadCount(chatKey)
          }
          
          const lastMessage = extractMessageSummary(rawMessage)
          
          // 提取发送者信息用于创建新会话
          let peerName: string | undefined
          let peerAvatar: string | undefined
          
          if (chatType === 'group') {
            // 群聊使用群名称
            peerName = rawMessage.peerName || undefined
            peerAvatar = `https://p.qlogo.cn/gh/${peerId}/${peerId}/640/`
          } else {
            // 私聊使用发送者信息
            peerName = rawMessage.sendNickName || rawMessage.sendMemberName || undefined
            peerAvatar = `https://q1.qlogo.cn/g?b=qq&nk=${peerId}&s=640`
          }
          
          updateRecentChat(chatType, peerId, lastMessage, parseInt(rawMessage.msgTime) * 1000, peerName, peerAvatar)
        }
      },
      (error) => {
        console.error('SSE 连接错误:', error)
      }
    )

    return () => {
      eventSource.close()
    }
  }, [incrementUnreadCount, updateRecentChat, appendCachedMessage])

  const handleSelectChat = useCallback((session: ChatSession) => {
    // 切换聊天时清空待处理消息队列
    pendingMessagesRef.current = []
    
    setCurrentChat(session)
    if (session.chatType !== 'group') {
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

  const handleSelectFriend = useCallback((friend: FriendItem) => {
    handleSelectChat({
      chatType: 'friend',
      peerId: friend.uin,
      peerName: friend.remark || friend.nickname,
      peerAvatar: friend.avatar
    })
  }, [handleSelectChat])

  const handleSelectGroup = useCallback((group: GroupItem) => {
    handleSelectChat({
      chatType: 'group',
      peerId: group.groupCode,
      peerName: group.groupName,
      peerAvatar: group.avatar
    })
  }, [handleSelectChat])

  const handleSelectRecent = useCallback((recent: RecentChatItem) => {
    handleSelectChat({
      chatType: recent.chatType,
      peerId: recent.peerId,
      peerName: recent.peerName,
      peerAvatar: recent.peerAvatar
    })
  }, [handleSelectChat])

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
    <div className="flex h-[calc(100vh-120px)] bg-white/50 backdrop-blur-xl rounded-2xl overflow-hidden shadow-xl">
      <div className="w-72 border-r border-gray-200/50 flex-shrink-0">
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

      <div className="flex-1 flex flex-col min-w-0">
        <ChatWindow
          session={currentChat}
          onShowMembers={() => setShowMemberPanel(true)}
          onNewMessageCallback={handleSetNewMessageCallback}
        />
      </div>

      {showMemberPanel && currentChat?.chatType === 'group' && (
        <div className="w-64 border-l border-gray-200/50 flex-shrink-0">
          <GroupMemberPanel groupCode={currentChat.peerId} onClose={() => setShowMemberPanel(false)} />
        </div>
      )}
    </div>
  )
}

export default WebQQPage
