import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Reply, Trash2, AtSign, Hand, User, UserMinus, VolumeX, Award, Smile, Shield, ShieldOff, Star, Forward, ListChecks } from 'lucide-react'
import type { RawMessage, GroupMemberItem } from '../../../types/webqq'
import { getSelfUid, recallMessage, sendPoke, setMemberAdmin, addFavEmojiFromUrl } from '../../../utils/webqqApi'
import { showToast } from '../../common'

// 计算菜单位置，确保不超出屏幕
function useMenuPosition(x: number, y: number, menuRef: React.RefObject<HTMLDivElement>) {
  const [position, setPosition] = useState<{ left: number; top: number; ready: boolean }>({ left: -9999, top: -9999, ready: false })

  useEffect(() => {
    // 重置为未就绪状态
    setPosition({ left: -9999, top: -9999, ready: false })

    // 使用 requestAnimationFrame 确保 DOM 已渲染
    const frame = requestAnimationFrame(() => {
      if (!menuRef.current) {
        setPosition({ left: x, top: y, ready: true })
        return
      }

      const menuRect = menuRef.current.getBoundingClientRect()
      const padding = 10

      let left = x
      let top = y

      // 右边界检测
      if (x + menuRect.width > window.innerWidth - padding) {
        left = x - menuRect.width
      }
      // 左边界检测
      if (left < padding) {
        left = padding
      }
      // 下边界检测
      if (y + menuRect.height > window.innerHeight - padding) {
        top = y - menuRect.height
      }
      // 上边界检测
      if (top < padding) {
        top = padding
      }

      setPosition({ left, top, ready: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [x, y])

  return position
}

interface MessageContextMenuProps {
  contextMenu: { x: number; y: number; message: RawMessage; elementId?: string }
  session: { chatType: number; peerId: string } | null
  getCachedMembers: (groupCode: string) => GroupMemberItem[] | null
  onClose: () => void
  onReply: (message: RawMessage) => void
  onEmojiReaction: (message: RawMessage, x: number, y: number) => void
  onRecall: (msgId: string) => void
  onForward: (message: RawMessage) => void
  onMultiSelect: (message: RawMessage) => void
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  contextMenu,
  session,
  getCachedMembers,
  onClose,
  onReply,
  onEmojiReaction,
  onRecall,
  onForward,
  onMultiSelect
}) => {
  const msg = contextMenu.message
  const selfUid = getSelfUid()
  const isSelfMessage = selfUid && msg.senderUid === selfUid
  const isGroup = msg.chatType === 2
  const cachedMembers = isGroup && session ? getCachedMembers(session.peerId) : null
  const selfMember = cachedMembers && selfUid ? cachedMembers.find((m) => m.uid === selfUid) : null
  const selfRole = selfMember?.role
  const isOwner = selfRole === 'owner'
  const isAdmin = selfRole === 'admin' || selfRole === 'owner'
  const targetMember = cachedMembers ? cachedMembers.find((m) => m.uid === msg.senderUid) : null
  const targetRole = targetMember?.role
  const targetIsAdmin = targetRole === 'admin' || targetRole === 'owner'
  const canRecall = isSelfMessage || (isGroup && (isOwner || (isAdmin && !targetIsAdmin)))

  // 检查是否是图片右键菜单（有 elementId 说明是在图片上右键）
  const isImageMenu = !!contextMenu.elementId

  const menuRef = useRef<HTMLDivElement>(null)
  const position = useMenuPosition(contextMenu.x, contextMenu.y, menuRef)

  const handleAddToFavEmoji = async () => {
    if (!contextMenu.elementId) return
    onClose()
    try {
      // 从 message.elements 找出右键命中的 picElement，取它的 originImageUrl
      // (跟 MessageElements.tsx 里渲染图片用的同一份字段，host 拼接逻辑也跟它对齐)
      const target = msg.elements.find((e: any) => e.elementId === contextMenu.elementId)
      const pic = target?.picElement
      const rawUrl: string = pic?.originImageUrl || ''
      if (!rawUrl) {
        showToast('图片地址为空，无法添加', 'error')
        return
      }
      const url = rawUrl.startsWith('http') ? rawUrl : `https://gchat.qpic.cn${rawUrl}`

      const result = await addFavEmojiFromUrl(url)
      if (result.result === 0) {
        showToast(result.isExist ? '表情已存在' : '已添加到表情', 'success')
      } else {
        showToast(result.errMsg || '添加失败', 'error')
      }
    } catch (e) {
      showToast(e.message || '添加失败', 'error')
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        className="fixed z-50 bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 min-w-[100px]"
        style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          onClick={() => { onReply(msg); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
        >
          <Reply size={14} /> 回复
        </button>
        {!isImageMenu && (
          <>
            <button
              onClick={() => { onForward(msg); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
            >
              <Forward size={14} /> 转发
            </button>
            <button
              onClick={() => { onMultiSelect(msg); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
            >
              <ListChecks size={14} /> 多选转发
            </button>
          </>
        )}
        {session.chatType === 2 && (
          <button
            onClick={() => { onEmojiReaction(msg, contextMenu.x, contextMenu.y); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
          >
            <Smile size={14} /> 贴表情
          </button>
        )}
        {isImageMenu && (
          <button
            onClick={handleAddToFavEmoji}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
          >
            <Star size={14} /> 添加到表情
          </button>
        )}
        {canRecall && (
          <button
            onClick={async () => {
              onClose()
              try {
                await recallMessage(msg.chatType, msg.peerUid, msg.msgId)
                onRecall(msg.msgId)
                showToast('消息已撤回', 'success')
              } catch (e) {
                showToast(e.message || '撤回失败', 'error')
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-theme-item-hover transition-colors"
          >
            <Trash2 size={14} /> 撤回
          </button>
        )}
      </div>
    </>,
    document.body
  )
}

interface AvatarContextMenuInfo {
  x: number
  y: number
  senderUid: string
  senderUin: string
  senderName: string
  chatType: number
  groupCode?: string
}

interface AvatarContextMenuProps {
  avatarContextMenu: AvatarContextMenuInfo
  getCachedMembers: (groupCode: string) => GroupMemberItem[] | null
  onClose: () => void
  onInsertAt: (uid: string, uin: string, name: string) => void
  onShowProfile: (uid: string, uin: string, x: number, y: number, groupCode?: string) => void
  onSetTitle: (uid: string, name: string, groupCode: string) => void
  onMute: (uid: string, name: string, groupCode: string) => void
  onKick: (uid: string, name: string, groupCode: string, groupName: string) => void
  onAdminChanged?: () => void
  groupName?: string
}

export const AvatarContextMenu: React.FC<AvatarContextMenuProps> = ({
  avatarContextMenu,
  getCachedMembers,
  onClose,
  onInsertAt,
  onShowProfile,
  onSetTitle,
  onMute,
  onKick,
  onAdminChanged,
  groupName
}) => {
  const selfUid = getSelfUid()
  const cachedMembers = avatarContextMenu.groupCode ? getCachedMembers(avatarContextMenu.groupCode) : null
  const selfMember = cachedMembers && selfUid ? cachedMembers.find(m => m.uid === selfUid) : null
  const selfRole = selfMember?.role
  const isOwner = selfRole === 'owner'
  const isAdmin = selfRole === 'admin'
  const targetMember = cachedMembers ? cachedMembers.find(m => m.uid === avatarContextMenu.senderUid) : null
  const targetRole = targetMember?.role
  const targetIsAdmin = targetRole === 'admin'
  const canMute = isOwner || (isAdmin && targetRole === 'member')
  const canKick = isOwner || (isAdmin && targetRole === 'member')
  const isSelf = avatarContextMenu.senderUid === selfUid
  // 只有群主可以设置/取消管理员，且不能对自己操作
  const canSetAdmin = isOwner && !isSelf

  const menuRef = useRef<HTMLDivElement>(null)
  const position = useMenuPosition(avatarContextMenu.x, avatarContextMenu.y, menuRef)

  const handleToggleAdmin = async () => {
    const info = avatarContextMenu
    onClose()
    try {
      // targetIsAdmin 表示目前已经是管理员；点击后切换：是 → 取消，不是 → 设为
      await setMemberAdmin(info.groupCode, info.senderUid, !targetIsAdmin)
      showToast(targetIsAdmin ? '已取消管理员' : '已设为管理员', 'success')
      onAdminChanged?.()
    } catch (e) {
      showToast(e.message || '操作失败', 'error')
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        className="fixed z-50 bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 min-w-[120px]"
        style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {avatarContextMenu.chatType === 2 && (
          <button
            onClick={() => { onInsertAt(avatarContextMenu.senderUid, avatarContextMenu.senderUin, avatarContextMenu.senderName); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
          >
            <AtSign size={14} /> 召唤ta
          </button>
        )}
        <button
          onClick={async () => {
            const info = avatarContextMenu
            onClose()
            try {
              if (info.chatType === 2 && info.groupCode) {
                await sendPoke(info.chatType, parseInt(info.senderUin), parseInt(info.groupCode))
              } else {
                await sendPoke(info.chatType, parseInt(info.senderUin))
              }
            } catch (e) {
              showToast(e.message || '戳一戳失败', 'error')
            }
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
        >
          <Hand size={14} /> 戳一戳
        </button>
        <button
          onClick={() => { onShowProfile(avatarContextMenu.senderUid, avatarContextMenu.senderUin, avatarContextMenu.x, avatarContextMenu.y, avatarContextMenu.groupCode); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
        >
          <User size={14} /> 查看资料
        </button>
        {avatarContextMenu.chatType === 2 && avatarContextMenu.groupCode && isOwner && (
          <button
            onClick={() => { onSetTitle(avatarContextMenu.senderUid, avatarContextMenu.senderName, avatarContextMenu.groupCode!); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
          >
            <Award size={14} /> 设置头衔
          </button>
        )}
        {avatarContextMenu.chatType === 2 && avatarContextMenu.groupCode && canSetAdmin && (
          <button
            onClick={handleToggleAdmin}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
          >
            {targetIsAdmin ? <ShieldOff size={14} /> : <Shield size={14} />}
            {targetIsAdmin ? '取消管理员' : '设为管理员'}
          </button>
        )}
        {avatarContextMenu.chatType === 2 && avatarContextMenu.groupCode && !isSelf && canMute && (
          <button
            onClick={() => { onMute(avatarContextMenu.senderUid, avatarContextMenu.senderName, avatarContextMenu.groupCode!); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-500 hover:bg-theme-item-hover transition-colors"
          >
            <VolumeX size={14} /> 禁言
          </button>
        )}
        {avatarContextMenu.chatType === 2 && avatarContextMenu.groupCode && !isSelf && canKick && (
          <button
            onClick={() => { onKick(avatarContextMenu.senderUid, avatarContextMenu.senderName, avatarContextMenu.groupCode!, groupName || avatarContextMenu.groupCode!); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-theme-item-hover transition-colors"
          >
            <UserMinus size={14} /> 踢出群
          </button>
        )}
      </div>
    </>,
    document.body
  )
}
