import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Trash2 } from 'lucide-react'
import { ntCall } from '../../../utils/webqqApi'
import { showToast } from '../../common'

export interface FavEmoji {
  emoId: number
  resId: string
  url: string
  desc: string
}

// 模块级缓存
let cachedEmojis: FavEmoji[] | null = null

// 清除缓存（供外部调用）
export const clearFavEmojiCache = () => {
  cachedEmojis = null
}

const RECENT_FAV_EMOJI_KEY = 'webqq_recent_fav_emojis'
const MAX_RECENT = 10

function getRecentFavEmojis(): FavEmoji[] {
  try {
    const stored = localStorage.getItem(RECENT_FAV_EMOJI_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addRecentFavEmoji(emoji: FavEmoji) {
  const recent = getRecentFavEmojis().filter(e => e.emoId !== emoji.emoId)
  recent.unshift(emoji)
  localStorage.setItem(RECENT_FAV_EMOJI_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

function removeRecentFavEmoji(emoId: number) {
  const recent = getRecentFavEmojis().filter(e => e.emoId !== emoId)
  localStorage.setItem(RECENT_FAV_EMOJI_KEY, JSON.stringify(recent))
}

// 表情右键菜单
const EmojiContextMenu: React.FC<{
  x: number
  y: number
  emoji: FavEmoji
  onClose: () => void
  onDelete: () => void
}> = ({ x, y, onClose, onDelete }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useEffect(() => {
    if (!menuRef.current) return
    const menuRect = menuRef.current.getBoundingClientRect()
    const padding = 10
    let left = x, top = y
    if (x + menuRect.width > window.innerWidth - padding) left = x - menuRect.width
    if (left < padding) left = padding
    if (y + menuRect.height > window.innerHeight - padding) top = y - menuRect.height
    if (top < padding) top = padding
    setPosition({ left, top })
  }, [x, y])

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        className="fixed z-[60] bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 min-w-[100px]"
        style={{ left: position.left, top: position.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          onClick={onDelete}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-theme-item-hover transition-colors"
        >
          <Trash2 size={14} /> 删除
        </button>
      </div>
    </>,
    document.body
  )
}

interface FavEmojiPickerProps {
  onSelect: (emoji: FavEmoji) => void
  onClose: () => void
}

export const FavEmojiPicker: React.FC<FavEmojiPickerProps> = ({ onSelect, onClose }) => {
  const [emojis, setEmojis] = useState<FavEmoji[]>(cachedEmojis || [])
  const [loading, setLoading] = useState(!cachedEmojis)
  const [error, setError] = useState<string | null>(null)
  const [recentEmojis, setRecentEmojis] = useState<FavEmoji[]>(getRecentFavEmojis())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; emoji: FavEmoji } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 如果有缓存，直接使用
    if (cachedEmojis) {
      setEmojis(cachedEmojis)
      setLoading(false)
      return
    }

    const loadEmojis = async () => {
      try {
        const result = await ntCall<{ emojiInfoList: any[] }>('ntMsgApi', 'fetchFavEmojiList', [1000])
        const list = result.emojiInfoList || []
        const emojiList = list.map(item => ({
          emoId: item.emoId,
          resId: item.resId || '',
          url: item.url,
          desc: item.desc || ''
        }))
        cachedEmojis = emojiList
        setEmojis(emojiList)
      } catch {
        setError('加载失败')
      } finally {
        setLoading(false)
      }
    }
    loadEmojis()
  }, [])

  // 使用 ref 跟踪 contextMenu 状态，避免闭包问题
  const contextMenuRef = useRef(contextMenu)
  contextMenuRef.current = contextMenu

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // 如果右键菜单打开，不关闭 Picker
      if (contextMenuRef.current) return
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSelect = (emoji: FavEmoji) => {
    addRecentFavEmoji(emoji)
    setRecentEmojis(getRecentFavEmojis())
    onSelect(emoji)
  }

  const handleContextMenu = (e: React.MouseEvent, emoji: FavEmoji) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, emoji })
  }

  const handleDelete = async () => {
    if (!contextMenu) return
    const { emoji } = contextMenu
    setContextMenu(null)

    try {
      const result = await ntCall<{ result: number; errMsg: string }>('ntMsgApi', 'deleteFavEmoji', [[emoji.resId]])
      if (result.result === 0) {
        showToast('已删除', 'success')
        // 更新列表
        const newEmojis = emojis.filter(e => e.emoId !== emoji.emoId)
        setEmojis(newEmojis)
        cachedEmojis = newEmojis
        // 从最近使用中移除
        removeRecentFavEmoji(emoji.emoId)
        setRecentEmojis(getRecentFavEmojis())
      } else {
        showToast(result.errMsg || '删除失败', 'error')
      }
    } catch (e) {
      showToast(e.message || '删除失败', 'error')
    }
  }

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 mb-2 bg-theme-card border border-theme-divider rounded-xl shadow-xl z-50 w-[320px]"
    >
      <div className="p-2 border-b border-theme-divider text-sm text-theme-secondary">收藏表情</div>
      <div className="p-2 max-h-[300px] overflow-y-auto">
        {recentEmojis.length > 0 && (
          <>
            <div className="text-xs text-theme-hint mb-1">最近使用</div>
            <div className="grid grid-cols-4 gap-1 mb-2 pb-2 border-b border-theme-divider">
              {recentEmojis.map((emoji) => (
                <button
                  key={`recent-${emoji.emoId}`}
                  onClick={() => handleSelect(emoji)}
                  onContextMenu={(e) => handleContextMenu(e, emoji)}
                  className="p-1 rounded-lg hover:bg-theme-item transition-colors"
                  title={emoji.desc}
                >
                  <img src={emoji.url} alt={emoji.desc} className="w-16 h-16 object-contain" />
                </button>
              ))}
            </div>
          </>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-pink-500" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-theme-hint text-sm">{error}</div>
        ) : emojis.length === 0 ? (
          <div className="text-center py-8 text-theme-hint text-sm">暂无收藏表情</div>
        ) : (
          <>
            <div className="text-xs text-theme-hint mb-1">全部</div>
            <div className="grid grid-cols-4 gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji.emoId}
                  onClick={() => handleSelect(emoji)}
                  onContextMenu={(e) => handleContextMenu(e, emoji)}
                  className="p-1 rounded-lg hover:bg-theme-item transition-colors"
                  title={emoji.desc}
                >
                  <img
                    src={emoji.url}
                    alt={emoji.desc}
                    className="w-16 h-16 object-contain"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <EmojiContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          emoji={contextMenu.emoji}
          onClose={() => setContextMenu(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

export default FavEmojiPicker
