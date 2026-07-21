import React from 'react'
import { createPortal } from 'react-dom'
import type { RawMessage } from '../../../types/webqq'
import { setEmojiLike } from '../../../utils/webqqApi'
import { showToast } from '../../common'
import { EmojiPicker } from './EmojiPicker'

interface EmojiReactionPickerProps {
  target: { message: RawMessage; x: number; y: number }
  onClose: () => void
  onReacted?: (emojiId: string) => void
  containerRef?: React.RefObject<HTMLDivElement>
}

export const EmojiReactionPicker: React.FC<EmojiReactionPickerProps> = ({ target, onClose, onReacted, containerRef }) => {
  // QQ 表情贴表情
  const handleSelect = async (faceId: number) => {
    const msg = target.message
    onClose()
    try {
      await setEmojiLike(msg.chatType, msg.peerUin, msg.msgSeq, String(faceId), true)
      onReacted?.(String(faceId))
    } catch (e) {
      showToast(e.message || '贴表情失败', 'error')
    }
  }

  // Unicode emoji 贴表情（使用码点）
  const handleSelectEmoji = async (emoji: string) => {
    const msg = target.message
    onClose()
    try {
      // 获取 emoji 的 Unicode 码点
      const codePoint = emoji.codePointAt(0)
      if (!codePoint) {
        showToast('无效的表情', 'error')
        return
      }
      await setEmojiLike(msg.chatType, msg.peerUin, msg.msgSeq, String(codePoint), true)
      onReacted?.(String(codePoint))
    } catch (e) {
      showToast(e.message || '贴表情失败', 'error')
    }
  }

  // 计算聊天窗口中央位置
  const getPosition = () => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect()
      return {
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2
      }
    }
    // 降级到屏幕中央
    return {
      left: window.innerWidth / 2,
      top: window.innerHeight / 2
    }
  }

  const pos = getPosition()

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div
        className="fixed z-50 -translate-x-1/2 -translate-y-1/2"
        style={{ left: pos.left, top: pos.top }}
      >
        <EmojiPicker onSelect={handleSelect} onSelectEmoji={handleSelectEmoji} onClose={onClose} inline />
      </div>
    </>,
    document.body
  )
}

export default EmojiReactionPicker
