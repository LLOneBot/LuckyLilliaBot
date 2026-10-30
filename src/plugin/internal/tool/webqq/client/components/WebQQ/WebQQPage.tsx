import React, { useEffect, useCallback, useState } from 'react'
import ContactList from './contact/ContactList'
import ChatWindow from './ChatWindow'
import GroupMemberPanel from './contact/GroupMemberPanel'
import GroupFilePanel from './contact/GroupFilePanel'
import type { ChatSession, FriendItem, GroupItem, RecentChatItem, RawMessage } from '../../types/webqq'
import { createEventSource, getSelfUin, getUserAvatar } from '../../utils/webqqApi'
import { useWebQQStore, resetVisitedChats } from '../../stores/webqqStore'
import { appendCachedMessage, updateCachedMessageEmojiReaction, markCachedMessageAsRecalled } from '../../utils/messageDb'
import { showToast } from '../common'
import { Loader2, Maximize2 } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { webui } from '../../context'

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
    if (element.multiForwardMsgElement) {
      summaryParts.push('[聊天记录]')
      continue
    }
    if (element.arkElement) {
      try {
        const arkData = JSON.parse(element.arkElement.bytesData)
        if (arkData.app === 'com.tencent.multimsg') {
          summaryParts.push('[聊天记录]')
          continue
        }
      } catch { /* ignore */ }
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
  // 回调就绪前收到的消息
  const pendingMessagesRef = React.useRef<RawMessage[]>([])

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
  const addNotification = useWebQQStore(state => state.addNotification)
  const loadGroupNotifications = useWebQQStore(state => state.loadGroupNotifications)

  // 用于从群成员面板 @ 成员
  const [appendInputMention, setAppendInputMention] = React.useState<{ uid: string; uin: string; name: string } | null>(null)
  // 跟成员面板互斥
  const [showFilePanel, setShowFilePanel] = React.useState(false)
  const [fileLocateTarget, setFileLocateTarget] = React.useState<{ folderId: string; fileId: string } | null>(null)

  // 有 target: 从文件卡片点击, 强制打开面板并定位; 无参: 顶部按钮 toggle
  const handleToggleFilePanel = useCallback((target?: { folderId: string; fileId: string }) => {
    if (target) {
      setFileLocateTarget(target)
      setShowFilePanel(true)
      setShowMemberPanel(false)
      return
    }
    setFileLocateTarget(null)
    setShowFilePanel(v => {
      const next = !v
      if (next) setShowMemberPanel(false)
      return next
    })
  }, [setShowMemberPanel])

  const handleToggleMemberPanel = useCallback(() => {
    setShowMemberPanel(!showMemberPanel)
    if (!showMemberPanel) setShowFilePanel(false)
  }, [showMemberPanel, setShowMemberPanel])

  const handleAtMember = useCallback((member: { uid: string; uin: string; name: string }) => {
    setAppendInputMention(member)
  }, [])

  const handleAppendInputMentionConsumed = useCallback(() => {
    setAppendInputMention(null)
  }, [])

  useEffect(() => {
    resetVisitedChats()
    loadContacts()
    loadGroupNotifications()
  }, [loadContacts, loadGroupNotifications])

  useEffect(() => {
    if (contactsError) {
      showToast(contactsError, 'error')
    }
  }, [contactsError])

  const currentChatRef = React.useRef(currentChat)

  useEffect(() => {
    currentChatRef.current = currentChat
  }, [currentChat])

  const handleSetNewMessageCallback = React.useCallback((callback: ((msg: RawMessage) => void) | null) => {
    onNewMessageRef.current = callback

    if (callback && pendingMessagesRef.current.length > 0) {
      const messages = [...pendingMessagesRef.current]
      pendingMessagesRef.current = []
      messages.forEach(msg => callback(msg))
    }

    forceUpdate(n => n + 1)
  }, [])

  const handleSetEmojiReactionCallback = React.useCallback((callback: ((data: { groupCode: string; msgSeq: string; emojiId: string; userId: string; userName: string; isAdd: boolean }) => void) | null) => {
    onEmojiReactionRef.current = callback
  }, [])

  const handleSetMessageRecalledCallback = React.useCallback((callback: ((data: { msgId: string; msgSeq: string }) => void) | null) => {
    onMessageRecalledRef.current = callback
  }, [])

  useEffect(() => {
    const eventSource = createEventSource(
      (data) => {
        if (data.type === 'message-created' || data.type === 'message-sent') {
          const rawMessage: RawMessage = data.data

          if (!rawMessage || !rawMessage.msgId || !rawMessage.elements || !Array.isArray(rawMessage.elements)) {
            console.warn('SSE 收到无效消息:', rawMessage)
            return
          }

          const chatType = rawMessage.chatType as 1 | 2 | 100
          // 必须转 string, peerId 都按 string 比较; data 是 unknown, 类型检查兜不住
          const peerId = String(rawMessage.peerUin || rawMessage.peerUid)
          const chatKey = `${chatType}_${peerId}`
          const chat = currentChatRef.current

          appendCachedMessage(chatType, peerId, rawMessage)

          if (chat && chat.chatType === chatType && chat.peerId === peerId) {
            if (onNewMessageRef.current) {
              onNewMessageRef.current(rawMessage)
            } else {
              pendingMessagesRef.current.push(rawMessage)
            }
          } else {
            incrementUnreadCount(chatKey)
          }

          const lastMessage = extractMessageSummary(rawMessage)

          let peerName: string | undefined
          let peerAvatar: string | undefined

          if (chatType === 2) {
            peerName = rawMessage.peerName || undefined
            peerAvatar = `https://p.qlogo.cn/gh/${peerId}/${peerId}/640/`
          } else {
            peerName = rawMessage.sendNickName || rawMessage.sendMemberName || undefined
            peerAvatar = getUserAvatar(peerId)
          }

          updateRecentChat(chatType, peerId, lastMessage, rawMessage.msgTime * 1000, peerName, peerAvatar)
        } else if (data.type === 'emoji-reaction') {
          const { groupCode, msgSeq, emojiId, userId, userName, isAdd } = data.data
          // 自己贴的表情已经乐观更新过, server 推回来再处理会重复计数
          if (userId && String(userId) === String(getSelfUin())) return
          const chat = currentChatRef.current

          updateCachedMessageEmojiReaction(2, groupCode, msgSeq, emojiId, isAdd)

          if (chat && chat.chatType === 2 && chat.peerId === groupCode) {
            if (onEmojiReactionRef.current) {
              onEmojiReactionRef.current({ groupCode, msgSeq, emojiId, userId, userName, isAdd })
            }
          }
        } else if (data.type === 'message-deleted') {
          const { msgId, msgSeq, chatType, peerUid, peerUin } = data.data
          const peerId = peerUin || peerUid
          const chat = currentChatRef.current

          markCachedMessageAsRecalled(chatType, peerId, msgId, msgSeq)

          if (chat && chat.chatType === chatType && chat.peerId === peerId) {
            if (onMessageRecalledRef.current) {
              onMessageRecalledRef.current({ msgId, msgSeq })
            }
          }
        } else if (data.type === 'group-notify') {
          const notifyData = data.data
          addNotification({
            type: 'group-notify',
            data: notifyData,
            time: notifyData.actionTime ? parseInt(notifyData.actionTime) * 1000 : Date.now()
          })
        } else if (data.type === 'friend-request') {
          const reqData = data.data
          addNotification({
            type: 'friend-request',
            data: reqData,
            time: reqData.reqTime ? parseInt(reqData.reqTime) * 1000 : Date.now()
          })
        } else if (data.type === 'group-dismiss') {
          addNotification({
            type: 'group-dismiss',
            data: data.data,
            time: Date.now()
          })
        } else if (data.type === 'group-quit') {
          addNotification({
            type: 'group-quit',
            data: data.data,
            time: Date.now()
          })
        }
      },
      (error) => {
        console.error('SSE 连接错误:', error)
      },
      () => {
        console.log('[WebQQ] SSE 重连成功，重置已访问聊天标志')
        // 下次进聊天时重新拉历史
        resetVisitedChats()
        loadContacts()
      }
    )

    return () => {
      eventSource.close()
    }
  }, [incrementUnreadCount, updateRecentChat, loadContacts, addNotification])

  const handleSelectChat = useCallback((session: ChatSession) => {
    pendingMessagesRef.current = []

    setCurrentChat(session)
    setFileLocateTarget(null)
    if (session.chatType !== 2) {
      setShowMemberPanel(false)
      setShowFilePanel(false)
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

  // 移动端显示聊天窗口时隐藏联系人列表
  const [showChatOnMobile, setShowChatOnMobile] = useState(false)

  const handleSelectChatMobile = useCallback((session: ChatSession) => {
    handleSelectChat(session)
    setShowChatOnMobile(true)
  }, [handleSelectChat])

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
      <div className="flex h-[calc(100vh-80px)] md:h-[calc(100vh-120px)] glass glass-regular rounded-none md:r-panel overflow-hidden">
        {/* 联系人列表 - 移动端全屏，桌面端固定宽度 */}
        <div className={`
          w-full md:w-72 md:hairline-r flex-shrink-0
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
            onShowMembers={handleToggleMemberPanel}
            onShowFiles={handleToggleFilePanel}
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
          <div className="fixed inset-0 z-50 bg-[rgb(var(--glass-tint)/0.92)] backdrop-blur-xl md:static md:inset-auto md:z-auto md:bg-transparent md:backdrop-blur-none md:w-64 md:hairline-l md:flex-shrink-0">
            <GroupMemberPanel
              groupCode={currentChat.peerId}
              onClose={() => setShowMemberPanel(false)}
              onAtMember={handleAtMember}
            />
          </div>
        )}

        {/* 群文件面板 - 桌面端侧边栏，移动端全屏覆盖 */}
        {showFilePanel && currentChat?.chatType === 2 && (
          <div className="fixed inset-0 z-50 bg-[rgb(var(--glass-tint)/0.92)] backdrop-blur-xl md:static md:inset-auto md:z-auto md:bg-transparent md:backdrop-blur-none md:w-80 md:hairline-l md:flex-shrink-0">
            <GroupFilePanel
              groupCode={currentChat.peerId}
              locateTarget={fileLocateTarget}
              onClose={() => { setShowFilePanel(false); setFileLocateTarget(null) }}
            />
          </div>
        )}
      </div>

      {/* 全屏按钮, 固定在窗口右下角 */}
      {!isFullscreen && showWebQQFullscreenButton && (
        <button
          onClick={() => window.open(webui().pageHref('webqq', { fullscreen: true }), '_blank')}
          className="fixed top-4 right-4 md:top-auto md:bottom-6 md:right-6 z-50 p-3 glass glass-chrome glass-interactive r-capsule text-[var(--accent)] transition-all duration-200 group"
          title="在新窗口中全屏打开"
        >
          <Maximize2 size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      )}
    </>
  )
}

export default WebQQPage
