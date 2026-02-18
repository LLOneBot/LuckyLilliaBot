import React, { useState, useEffect, memo } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import type { RawMessage, GroupMemberItem } from '../../../types/webqq'
import { formatMessageTime, getSelfUid, getSelfUin, getUserDisplayName, ntCall } from '../../../utils/webqqApi'
import { MessageElementRenderer, hasValidContent, isSystemTipMessage } from './MessageElements'
import { showToast } from '../../common'

// 消息右键菜单上下文
export const MessageContextMenuContext = React.createContext<{
  showMenu: (e: React.MouseEvent, message: RawMessage) => void
} | null>(null)

// 头像右键菜单信息
export interface AvatarContextMenuInfo {
  x: number
  y: number
  senderUid: string
  senderUin: string
  senderName: string
  chatType: number
  groupCode?: string
}

// 头像右键菜单上下文
export const AvatarContextMenuContext = React.createContext<{
  showMenu: (e: React.MouseEvent, info: Omit<AvatarContextMenuInfo, 'x' | 'y'>) => void
} | null>(null)

// 跳转到消息上下文
export const ScrollToMessageContext = React.createContext<{
  scrollToMessage: (msgId: string, msgSeq?: string) => void
} | null>(null)

// 群成员缓存上下文
export const GroupMembersContext = React.createContext<{
  getMembers: (groupCode: string) => GroupMemberItem[] | null
} | null>(null)

// 好友缓存上下文
export interface FriendInfo {
  uid: string
  uin: string
  nickname: string
  remark?: string
}

export const FriendsContext = React.createContext<{
  getFriend: (uin: string) => FriendInfo | null
} | null>(null)

// 临时消息元素类型
export interface TempMessageItem {
  type: 'text' | 'face' | 'image' | 'at'
  content?: string
  faceId?: number
  imageUrl?: string
  atName?: string
}

export interface TempMessage {
  msgId: string
  items: TempMessageItem[]
  timestamp: number
  status: 'sending' | 'sent' | 'failed'
}

// 解析戳一戳 JSON 中的 items
const parseGrayTipItems = (message: RawMessage): { items: any[]; hasUid: boolean } | null => {
  for (const el of message.elements) {
    if (el.grayTipElement?.jsonGrayTipElement?.jsonStr) {
      try {
        const json = JSON.parse(el.grayTipElement.jsonGrayTipElement.jsonStr)
        if (json.items) {
          const hasUid = json.items.some((item: any) => item.type === 'qq' && item.uid)
          return { items: json.items, hasUid }
        }
      } catch {
        // ignore
      }
    }
  }
  return null
}

// 系统提示消息内容缓存
const systemTipContentCache = new Map<string, React.ReactNode>()

// 系统提示消息组件
const SystemTipMessage = memo<{ message: RawMessage; groupCode?: string }>(({ message, groupCode }) => {
  const cachedContent = systemTipContentCache.get(message.msgId)
  const [content, setContent] = useState<React.ReactNode>(cachedContent ?? '[系统提示]')
  const selfUid = getSelfUid()
  
  useEffect(() => {
    if (systemTipContentCache.has(message.msgId)) {
      setContent(systemTipContentCache.get(message.msgId)!)
      return
    }
    
    const parsed = parseGrayTipItems(message)
    if (!parsed) {
      for (const el of message.elements) {
        if (el.grayTipElement?.xmlElement?.content) {
          const xmlContent = el.grayTipElement.xmlElement.content.replace(/<[^>]+>/g, '')
          systemTipContentCache.set(message.msgId, xmlContent)
          setContent(xmlContent)
          return
        }
      }
      systemTipContentCache.set(message.msgId, '[系统提示]')
      setContent('[系统提示]')
      return
    }
    
    const { items, hasUid } = parsed
    
    if (!hasUid) {
      const result = items.map((item: any) => item.txt || '').join('')
      const finalContent = result || '[系统提示]'
      systemTipContentCache.set(message.msgId, finalContent)
      setContent(finalContent)
      return
    }
    
    const resolveContent = async () => {
      const parts: React.ReactNode[] = []
      let keyIndex = 0
      for (const item of items) {
        if (item.type === 'qq' && item.uid) {
          if (item.uid === selfUid) {
            parts.push(<span key={keyIndex++} className="text-blue-500">你</span>)
          } else {
            const name = await getUserDisplayName(item.uid, groupCode)
            parts.push(<span key={keyIndex++} className="text-blue-500">{name}</span>)
          }
        } else if (item.type === 'nor' && item.txt) {
          parts.push(<span key={keyIndex++}>{item.txt}</span>)
        }
      }
      const finalContent = parts.length > 0 ? parts : '[系统提示]'
      systemTipContentCache.set(message.msgId, finalContent)
      setContent(finalContent)
    }
    
    resolveContent()
  }, [message.msgId, selfUid, groupCode])
  
  return (
    <div className="flex justify-center py-2">
      <span className="text-xs text-theme-hint bg-theme-item/50 px-3 py-1 rounded-full">
        {content}
      </span>
    </div>
  )
})

export const RawMessageBubble = memo<{ message: RawMessage; allMessages: RawMessage[]; isHighlighted?: boolean }>(({ message, allMessages, isHighlighted }) => {
  if (isSystemTipMessage(message)) {
    const groupCode = message.chatType === 2 ? message.peerUin : undefined
    return <SystemTipMessage message={message} groupCode={groupCode} />
  }
  
  const selfUid = getSelfUid()
  const isSelf = selfUid ? message.senderUid === selfUid : false
  const contextMenuContext = React.useContext(MessageContextMenuContext)
  const avatarContextMenuContext = React.useContext(AvatarContextMenuContext)
  const scrollToMessageContext = React.useContext(ScrollToMessageContext)
  const groupMembersContext = React.useContext(GroupMembersContext)
  const friendsContext = React.useContext(FriendsContext)
  
  // 获取发送者名称
  let senderName = message.sendMemberName || message.sendNickName || message.senderUin
  
  // 私聊时从好友列表获取备注或昵称
  if (message.chatType === 1 && !isSelf && friendsContext) {
    const friend = friendsContext.getFriend(message.senderUin)
    if (friend) {
      senderName = friend.remark || friend.nickname || senderName
    }
  }
  
  const senderAvatar = `https://q1.qlogo.cn/g?b=qq&nk=${message.senderUin}&s=640`
  const timestamp = parseInt(message.msgTime) * 1000
  
  // 从 msgAttrs 中获取群等级和头衔
  let memberLevel: number | undefined
  let memberTitle: string | undefined
  let memberRole: 'owner' | 'admin' | 'member' | undefined
  
  if (message.chatType === 2) {
    // 从 msgAttrs 获取群荣誉信息（包含等级和头衔）
    const msgAttrs = message.msgAttrs
    if (msgAttrs) {
      // msgAttrs 可能是 Map 或普通对象（JSON 序列化后）
      const getAttr = (key: number) => {
        if (msgAttrs instanceof Map) {
          return msgAttrs.get(key)
        } else if (typeof msgAttrs === 'object') {
          return (msgAttrs as Record<string, any>)[key.toString()]
        }
        return undefined
      }
      
      // attrType 2 包含 groupHonor（群等级和头衔）
      const honorAttr = getAttr(2)
      if (honorAttr?.groupHonor) {
        memberLevel = honorAttr.groupHonor.level
        memberTitle = honorAttr.groupHonor.uniqueTitle || undefined
      }
    }
    
    // 从缓存的群成员信息获取角色
    if (groupMembersContext) {
      const members = groupMembersContext.getMembers(message.peerUin)
      const member = members?.find(m => m.uid === message.senderUid || m.uin === message.senderUin)
      if (member) {
        memberRole = member.role
        // 如果 msgAttrs 没有等级信息，从成员缓存获取
        if (memberLevel === undefined && member.level) {
          memberLevel = member.level
        }
        // 如果 msgAttrs 没有头衔信息，从成员缓存获取
        if (!memberTitle && member.specialTitle) {
          memberTitle = member.specialTitle
        }
      }
    }
  }
  
  if (!message.elements || !Array.isArray(message.elements)) return null

  // 检查消息是否已撤回
  const isRecalled = message.recallTime && message.recallTime !== '0'

  const replyElement = message.elements.find(el => el.replyElement)?.replyElement
  const otherElements = message.elements.filter(el => !el.replyElement)
  
  const hasContent = otherElements.some(hasValidContent) || replyElement
  if (!hasContent) return null

  // 检查是否只有语音消息（不需要气泡）
  const isPttOnly = otherElements.length === 1 && otherElements[0].pttElement && !replyElement

  const replySourceMsg = replyElement ? allMessages.find(m => m.msgId === replyElement.replayMsgId || m.msgSeq === replyElement.replayMsgSeq) : null

  const handleBubbleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuContext?.showMenu(e, message)
  }

  const handleAvatarContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    avatarContextMenuContext?.showMenu(e, {
      senderUid: message.senderUid,
      senderUin: message.senderUin,
      senderName,
      chatType: message.chatType,
      groupCode: message.chatType === 2 ? message.peerUin : undefined
    })
  }

  // 移动端单击头像也触发菜单
  const handleAvatarClick = (e: React.MouseEvent) => {
    // 检测是否为触摸设备（移动端）
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      e.preventDefault()
      e.stopPropagation()
      avatarContextMenuContext?.showMenu(e, {
        senderUid: message.senderUid,
        senderUin: message.senderUin,
        senderName,
        chatType: message.chatType,
        groupCode: message.chatType === 2 ? message.peerUin : undefined
      })
    }
  }

  const handleReplyClick = () => {
    if (replyElement) {
      scrollToMessageContext?.scrollToMessage(replyElement.replayMsgId, replyElement.replayMsgSeq)
    }
  }

  return (
    <div className={`flex gap-2 w-full ${isSelf ? 'flex-row-reverse' : ''} ${isHighlighted ? 'animate-pulse bg-pink-100 dark:bg-pink-900/30 rounded-lg -mx-2 px-2' : ''}`}>
      <img 
        src={senderAvatar} 
        alt={senderName} 
        loading="lazy" 
        className="w-8 h-8 rounded-full object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity" 
        onClick={handleAvatarClick}
        onContextMenu={handleAvatarContextMenu}
      />
      <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[calc(100%-48px)] md:max-w-[70%] min-w-0 overflow-hidden`}>
        <div className={`flex items-center gap-1.5 mb-1 ${isSelf ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs text-theme-hint">{senderName}</span>
          {memberLevel !== undefined && memberLevel > 0 && (
            <span className="text-xs px-1 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
              Lv.{memberLevel}
            </span>
          )}
          {memberRole === 'owner' && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 rounded">
              {memberTitle || '群主'}
            </span>
          )}
          {memberRole === 'admin' && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 rounded">
              {memberTitle || '管理员'}
            </span>
          )}
          {memberRole === 'member' && memberTitle && (
            <span className="text-xs px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-300 rounded">
              {memberTitle}
            </span>
          )}
        </div>
        {isPttOnly ? (
          <div onContextMenu={handleBubbleContextMenu} className={isRecalled ? 'opacity-50' : ''}>
            {otherElements.map((element, index) => <MessageElementRenderer key={index} element={element} message={message} />)}
            {isRecalled && <div className="text-xs text-theme-muted italic mt-1">已撤回</div>}
          </div>
        ) : (
          <div className="relative">
            <div 
              className={`rounded-2xl px-4 py-2 min-w-[80px] max-w-full break-words overflow-hidden bg-theme-item text-theme shadow-sm ${isSelf ? 'rounded-tr-sm' : 'rounded-tl-sm'} ${isRecalled ? 'opacity-50' : ''}`}
              onContextMenu={handleBubbleContextMenu}
            >
              {replyElement && (
              <div 
                className="text-xs mb-2 pb-2 border-b border-theme-divider cursor-pointer hover:opacity-80 transition-opacity"
                onClick={handleReplyClick}
              >
                <div className="bg-theme-input rounded px-2 py-1">
                  {replySourceMsg ? (
                    <div className="space-y-1">
                      <div className="font-medium text-theme-secondary">
                        {replySourceMsg.sendMemberName || replySourceMsg.sendNickName || replySourceMsg.senderUin}:
                      </div>
                      <div className="text-theme-muted">
                        {replySourceMsg.elements?.filter(el => !el.replyElement).map((el, i) => (
                          <MessageElementRenderer key={i} element={el} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-theme-muted">
                      {replyElement.sourceMsgText || '[消息]'}
                    </span>
                  )}
                </div>
              </div>
            )}
            {otherElements.map((element, index) => <MessageElementRenderer key={index} element={element} message={message} />)}
            </div>
            {isRecalled && (
              <div className="text-xs text-theme-muted italic mt-1">已撤回</div>
            )}
          </div>
        )}
        {/* 表情回应显示 */}
        <EmojiReactionList message={message} isSelf={isSelf} />
        <span className="text-xs text-theme-hint mt-1">{formatMessageTime(timestamp)}</span>
      </div>
    </div>
  )
})

// 获取表情图片路径
function getEmojiImagePath(emojiId: string, emojiType: string): string {
  // emojiType '1' 是 QQ 表情，直接用数字 ID
  // emojiType '2' 是 Unicode emoji，需要转换为 emoji-{codepoint}.png
  if (emojiType === '2') {
    // emojiId 是 Unicode 码点（十进制），转换为十六进制
    const codePoint = parseInt(emojiId).toString(16)
    return `/face/emoji-${codePoint}.png`
  }
  return `/face/${emojiId}.png`
}

// 表情回应列表组件
const EmojiReactionList = memo<{ message: RawMessage; isSelf: boolean }>(({ message, isSelf }) => {
  const [loading, setLoading] = useState<string | null>(null)
  
  if (!message.emojiLikesList || message.emojiLikesList.length === 0) return null

  const handleEmojiClick = async (emojiId: string, isClicked: boolean) => {
    if (loading) return
    setLoading(emojiId)
    try {
      const peer = { chatType: message.chatType, peerUid: message.peerUin, guildId: '' }
      // isClicked 为 true 表示自己已贴过，点击取消；否则点击添加
      await ntCall('ntMsgApi', 'setEmojiLike', [peer, message.msgSeq, emojiId, !isClicked])
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isSelf ? 'justify-end' : 'justify-start'}`}>
      {message.emojiLikesList.map((emoji, index) => {
        const imgSrc = getEmojiImagePath(emoji.emojiId, emoji.emojiType)
        return (
          <button 
            key={`${emoji.emojiId}-${index}`}
            onClick={() => handleEmojiClick(emoji.emojiId, emoji.isClicked)}
            disabled={loading === emoji.emojiId}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all cursor-pointer hover:scale-105 active:scale-95 ${
              emoji.isClicked 
                ? 'bg-pink-100 dark:bg-pink-900/40 border border-pink-300 dark:border-pink-700' 
                : 'bg-theme-item border border-theme-divider hover:border-pink-300 dark:hover:border-pink-700'
            } ${loading === emoji.emojiId ? 'opacity-50' : ''}`}
            title={emoji.isClicked ? '点击取消' : '点击跟贴'}
          >
            <img 
              src={imgSrc} 
              alt={`表情${emoji.emojiId}`} 
              className="w-4 h-4"
              onError={(e) => {
                // 图片加载失败时，尝试显示 Unicode emoji 字符
                if (emoji.emojiType === '2') {
                  const target = e.target as HTMLImageElement
                  const char = String.fromCodePoint(parseInt(emoji.emojiId))
                  target.style.display = 'none'
                  target.insertAdjacentHTML('afterend', `<span class="text-sm">${char}</span>`)
                }
              }}
            />
            <span className="text-theme-secondary">{emoji.likesCnt}</span>
          </button>
        )
      })}
    </div>
  )
})

export const TempMessageBubble = memo<{ message: TempMessage; onRetry: () => void }>(({ message, onRetry }) => {
  const selfUin = getSelfUin()
  const selfAvatar = selfUin ? `https://q1.qlogo.cn/g?b=qq&nk=${selfUin}&s=640` : ''
  
  return (
    <div className="flex gap-2 flex-row-reverse w-full">
      {selfAvatar && <img src={selfAvatar} alt="我" loading="lazy" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />}
      <div className="flex flex-col items-end max-w-[calc(100%-48px)] md:max-w-[70%] min-w-0 overflow-hidden">
        <span className="text-xs text-theme-hint mb-1">我</span>
        <div className="flex items-end gap-1">
          {message.status === 'failed' && <button onClick={onRetry} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="重新发送"><RefreshCw size={14} /></button>}
          <div 
            className="rounded-2xl px-4 py-2 bg-theme-item text-theme rounded-tr-sm min-w-[80px] max-w-full break-words overflow-hidden shadow-sm"
          >
            {message.items.map((item, index) => {
              if (item.type === 'text' && item.content) {
                return <span key={index} className="whitespace-pre-wrap break-words">{item.content}</span>
              }
              if (item.type === 'face' && item.faceId !== undefined) {
                return (
                  <img 
                    key={index}
                    src={`/face/${item.faceId}.png`}
                    alt={`[表情${item.faceId}]`}
                    className="inline-block align-text-bottom"
                    style={{ width: 24, height: 24 }}
                  />
                )
              }
              if (item.type === 'image' && item.imageUrl) {
                return <img key={index} src={item.imageUrl} alt="图片" loading="lazy" className="max-w-full rounded-lg" style={{ maxHeight: '200px' }} />
              }
              if (item.type === 'at' && item.atName) {
                return <span key={index} className="text-blue-500">@{item.atName}</span>
              }
              return null
            })}
          </div>
          {message.status === 'sending' && <Loader2 size={14} className="animate-spin text-theme-hint" />}
          {message.status === 'failed' && <AlertCircle size={14} className="text-red-500" />}
        </div>
        <span className="text-xs text-theme-hint mt-1">{formatMessageTime(message.timestamp)}</span>
      </div>
    </div>
  )
})
