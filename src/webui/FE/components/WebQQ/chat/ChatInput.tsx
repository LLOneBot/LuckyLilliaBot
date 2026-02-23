import React, { useRef, useCallback, useState, forwardRef, useImperativeHandle, useEffect } from 'react'
import { Send, Smile, Image as ImageIcon, Paperclip, Reply, X, Sticker } from 'lucide-react'
import { RichInput, type RichInputRef, type RichInputItem, type MentionState } from './RichInput'
import { MentionPicker } from './MentionPicker'
import { EmojiPicker, FavEmojiPicker, type FavEmoji } from '../message'
import { sendMessage, uploadImage, uploadImageByUrl, uploadFile, isValidImageFormat } from '../../../utils/webqqApi'
import { useWebQQStore, hasVisitedChat } from '../../../stores/webqqStore'
import { showToast } from '../../common'
import type { ChatSession, RawMessage, GroupMemberItem } from '../../../types/webqq'
import type { TempMessageItem } from '../message/MessageBubble'

export interface ChatInputRef {
  insertAt: (uid: string, uin: string, name: string) => void
  insertText: (text: string) => void
  focus: () => void
}

interface ChatInputProps {
  session: ChatSession | null
  replyTo: RawMessage | null
  onReplyCancel: () => void
  onSendStart: () => void
  onSendEnd: () => void
  onTempMessage: (msg: { msgId: string; items: TempMessageItem[]; timestamp: number; status: 'sending' | 'failed' }) => void
  onTempMessageRemove: (msgId: string) => void
  onTempMessageFail: (msgId: string) => void
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>((props, ref) => {
  const { session, replyTo, onReplyCancel, onSendStart, onSendEnd, onTempMessage, onTempMessageRemove, onTempMessageFail } = props
  
  const richInputRef = useRef<RichInputRef>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileUploadInputRef = useRef<HTMLInputElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFavEmojiPicker, setShowFavEmojiPicker] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  
  // @ 提及相关状态
  const [mentionState, setMentionState] = useState<MentionState>({ active: false, query: '', position: { top: 0, left: 0 } })
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  
  const { getCachedMembers, fetchGroupMembers } = useWebQQStore()
  
  // 用 ref 跟踪当前 session 的 peerId
  const currentPeerIdRef = useRef<string | null>(null)
  
  // 用 ref 存储函数避免依赖变化
  const getCachedMembersRef = useRef(getCachedMembers)
  getCachedMembersRef.current = getCachedMembers
  const fetchGroupMembersRef = useRef(fetchGroupMembers)
  fetchGroupMembersRef.current = fetchGroupMembers

  useImperativeHandle(ref, () => ({
    insertAt: (uid: string, uin: string, name: string) => {
      richInputRef.current?.insertAt(uid, uin, name)
    },
    insertText: (text: string) => {
      richInputRef.current?.insertText(text)
    },
    focus: () => {
      richInputRef.current?.focus()
    }
  }), [])

  // 当群聊会话变化时，加载群成员（使用全局缓存）
  useEffect(() => {
    const groupCode = session?.chatType === 2 ? session.peerId : null
    currentPeerIdRef.current = groupCode
    
    if (!groupCode) {
      setGroupMembers([])
      setMembersLoading(false)
      return
    }
    
    // 检查是否首次进入该聊天（用于决定是否强制刷新）
    const isFirstVisit = !hasVisitedChat(2, groupCode)
    
    // 先检查缓存（同步）- 非首次访问时使用缓存
    if (!isFirstVisit) {
      const cached = getCachedMembersRef.current(groupCode)
      if (cached) {
        setGroupMembers(cached)
        setMembersLoading(false)
        return
      }
    }
    
    // 需要加载
    setMembersLoading(true)
    setGroupMembers([])
    
    fetchGroupMembersRef.current(groupCode, isFirstVisit)
      .then(members => {
        if (currentPeerIdRef.current === groupCode) {
          setGroupMembers(members)
          setMembersLoading(false)
        }
      })
      .catch(() => {
        if (currentPeerIdRef.current === groupCode) {
          setMembersLoading(false)
        }
      })
  }, [session?.chatType, session?.peerId])  // 只依赖 session

  // 处理 @ 状态变化
  const handleMentionChange = useCallback((state: MentionState) => {
    // 只有群聊才显示 @ 选择器
    if (session?.chatType !== 2) {
      setMentionState({ active: false, query: '', position: { top: 0, left: 0 } })
      return
    }
    setMentionState(state)
  }, [session?.chatType])

  // 选择 @ 成员
  const handleMentionSelect = useCallback((member: GroupMemberItem) => {
    richInputRef.current?.insertAt(member.uid, member.uin, member.card || member.nickname)
  }, [])

  // 关闭 @ 选择器
  const handleMentionClose = useCallback(() => {
    richInputRef.current?.cancelMention()
  }, [])

  const handleSend = useCallback(async () => {
    if (!session || !richInputRef.current) return
    const items = richInputRef.current.getContent()
    const isEmpty = richInputRef.current.isEmpty()
    if (isEmpty) return
    
    onSendStart()
    const currentReplyTo = replyTo
    richInputRef.current.clear()
    onReplyCancel()
    setHasContent(false)
    
    // 立即聚焦回输入框
    setTimeout(() => richInputRef.current?.focus(), 0)

    // 转换为临时消息的 items 格式
    const tempItems: TempMessageItem[] = items.map(item => ({
      type: item.type,
      content: item.content,
      faceId: item.faceId,
      imageUrl: item.imageUrl,
      atName: item.atName
    }))
    
    const tempId = `temp_${Date.now()}`
    onTempMessage({ msgId: tempId, items: tempItems, timestamp: Date.now(), status: 'sending' })

    try {
      const content: any[] = []
      if (currentReplyTo) content.push({ type: 'reply', msgId: currentReplyTo.msgId, msgSeq: currentReplyTo.msgSeq })
      
      for (const item of items) {
        if (item.type === 'text' && item.content) content.push({ type: 'text', text: item.content })
        else if (item.type === 'face' && item.faceId !== undefined) content.push({ type: 'face', faceId: item.faceId })
        else if (item.type === 'image') {
          if (item.imageFile) {
            const uploadResult = await uploadImage(item.imageFile)
            content.push({ type: 'image', imagePath: uploadResult.imagePath })
          } else if (item.imageUrl) {
            // 没有 file，通过 URL 上传（收藏表情等）
            const uploadResult = await uploadImageByUrl(item.imageUrl)
            content.push({ type: 'image', imagePath: uploadResult.imagePath })
          }
        } else if (item.type === 'at' && item.atUid) content.push({ type: 'at', uid: item.atUid, uin: item.atUin, name: item.atName })
      }
      
      if (content.length === 0) { onTempMessageRemove(tempId); return }
      await sendMessage({ chatType: session.chatType, peerId: session.peerId, content })
      // 发送成功后立即移除临时消息，避免与SSE消息重复显示
      onTempMessageRemove(tempId)
    } catch (e: any) {
      showToast('发送失败', 'error')
      onTempMessageFail(tempId)
    } finally {
      onSendEnd()
    }
  }, [session, replyTo, onSendStart, onSendEnd, onReplyCancel, onTempMessage, onTempMessageRemove, onTempMessageFail])

  const handleEmojiSelect = useCallback((faceId: number) => {
    richInputRef.current?.insertFace(faceId)
    setShowEmojiPicker(false)
  }, [])

  // 选择 Unicode emoji - 插入文本
  const handleUnicodeEmojiSelect = useCallback((emoji: string) => {
    richInputRef.current?.insertText(emoji)
    setShowEmojiPicker(false)
  }, [])

  // 选择收藏表情 - 插入到输入框
  const handleFavEmojiSelect = useCallback((emoji: FavEmoji) => {
    setShowFavEmojiPicker(false)
    // 插入图片，file 为 null，发送时通过 URL 上传
    richInputRef.current?.insertImage(null, emoji.url)
  }, [])

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isValidImageFormat(file.name)) { showToast('不支持的图片格式，仅支持 JPG、PNG、GIF', 'error'); return }
    richInputRef.current?.insertImage(file, URL.createObjectURL(file))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !session) return
    if (file.size > 100 * 1024 * 1024) { showToast('文件过大，最大支持 100MB', 'error'); return }
    if (fileUploadInputRef.current) fileUploadInputRef.current.value = ''
    
    // 直接发送文件
    onSendStart()
    
    const tempId = `temp_${Date.now()}`
    onTempMessage({ msgId: tempId, items: [{ type: 'text', content: `[文件] ${file.name}` }], timestamp: Date.now(), status: 'sending' })
    
    try {
      const uploadResult = await uploadFile(file)
      await sendMessage({ 
        chatType: session.chatType, 
        peerId: session.peerId, 
        content: [{ type: 'file', filePath: uploadResult.filePath, fileName: uploadResult.fileName }] 
      })
      // 发送成功后立即移除临时消息，避免与SSE消息重复显示
      onTempMessageRemove(tempId)
    } catch (e: any) {
      showToast('发送失败', 'error')
      onTempMessageFail(tempId)
    } finally {
      onSendEnd()
    }
  }, [session, onSendStart, onSendEnd, onTempMessage, onTempMessageRemove, onTempMessageFail])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (!file) continue
        const ext = file.type.split('/')[1]?.toLowerCase()
        if (!['jpeg', 'jpg', 'png', 'gif'].includes(ext)) { showToast('不支持的图片格式', 'error'); return }
        richInputRef.current?.insertImage(file, URL.createObjectURL(file))
        return
      }
    }
  }, [])

  const handleContentChange = useCallback((items: RichInputItem[]) => {
    setHasContent(items.length > 0 && !(items.length === 1 && items[0].type === 'text' && !items[0].content?.trim()))
  }, [])

  return (
    <div className="border-t border-theme-divider bg-theme-card">
      {replyTo && (
        <div className="px-4 py-2 border-b border-theme-divider bg-theme-item">
          <div className="flex items-center gap-2">
            <Reply size={16} className="text-pink-500 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-sm text-theme-secondary truncate">
              回复 {replyTo.sendMemberName || replyTo.sendNickName || replyTo.senderUin}：
              {replyTo.elements?.filter(el => !el.replyElement).map((el, i) => {
                if (el.textElement) return <span key={i}>{el.textElement.content}</span>
                if (el.picElement) return <span key={i}>[图片]</span>
                if (el.faceElement) return <span key={i}>[表情]</span>
                return null
              })}
            </div>
            <button onClick={onReplyCancel} className="p-1 text-theme-hint hover:text-theme rounded"><X size={16} /></button>
          </div>
        </div>
      )}

      <div className="px-4 pt-0.5 pb-3">
        <div className="flex items-center gap-1 mb-2 relative">
          <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowFavEmojiPicker(false) }} className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/30' : 'text-theme-muted hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30'}`} title="表情">
            <Smile size={18} />
          </button>
          <button onClick={() => { setShowFavEmojiPicker(!showFavEmojiPicker); setShowEmojiPicker(false) }} className={`p-2 rounded-lg transition-colors ${showFavEmojiPicker ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/30' : 'text-theme-muted hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30'}`} title="收藏表情">
            <Sticker size={18} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-theme-muted hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors" title="图片">
            <ImageIcon size={18} />
          </button>
          <button onClick={() => fileUploadInputRef.current?.click()} className="p-2 text-theme-muted hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors" title="文件">
            <Paperclip size={18} />
          </button>
          {showEmojiPicker && <EmojiPicker onSelect={handleEmojiSelect} onSelectEmoji={handleUnicodeEmojiSelect} onClose={() => setShowEmojiPicker(false)} />}
          {showFavEmojiPicker && <FavEmojiPicker onSelect={handleFavEmojiSelect} onClose={() => setShowFavEmojiPicker(false)} />}
        </div>

        <div className="flex items-end gap-2 relative">
          <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/jpeg,image/png,image/gif" className="hidden" />
          <input type="file" ref={fileUploadInputRef} onChange={handleFileSelect} className="hidden" />
          <div className="flex-1 bg-theme-input border border-theme-input rounded-xl focus-within:ring-2 focus-within:ring-pink-500/20 overflow-hidden">
            <RichInput 
              ref={richInputRef} 
              placeholder="输入消息..." 
              onEnter={handleSend} 
              onPaste={handlePaste} 
              onChange={handleContentChange}
              onMentionChange={handleMentionChange}
            />
          </div>
          {/* @ 提及选择器 - 放在输入框外面避免 overflow 裁剪 */}
          {mentionState.active && session?.chatType === 2 && (
            <MentionPicker
              members={groupMembers}
              loading={membersLoading}
              query={mentionState.query}
              position={mentionState.position}
              onSelect={handleMentionSelect}
              onClose={handleMentionClose}
            />
          )}
          <button onClick={handleSend} disabled={!hasContent} className="p-2.5 bg-pink-500 text-white rounded-xl hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  )
})

ChatInput.displayName = 'ChatInput'
export default ChatInput
