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
  const handleSelect = async (faceId: number) => {
    const msg = target.message
    onClose()
    try {
      await setEmojiLike(msg.chatType, String(msg.peerUin), msg.msgSeq, String(faceId), true)
      onReacted?.(String(faceId))
    } catch (e) {
      showToast(e.message || '贴表情失败', 'error')
    }
  }

  const handleSelectEmoji = async (emoji: string) => {
    const msg = target.message
    onClose()
    try {
      const codePoint = emoji.codePointAt(0)
      if (!codePoint) {
        showToast('无效的表情', 'error')
        return
      }
      await setEmojiLike(msg.chatType, String(msg.peerUin), msg.msgSeq, String(codePoint), true)
      onReacted?.(String(codePoint))
    } catch (e) {
      showToast(e.message || '贴表情失败', 'error')
    }
  }

  // 聊天窗口中央, 拿不到就用屏幕中央
  const getPosition = () => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect()
      return {
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2
      }
    }
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
