import React, { useState, useEffect, useRef } from 'react'

// 可用的 QQ 表情 ID 列表（基于 public/face 目录）
const FACE_IDS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  41, 42, 43, 46, 49, 53, 56, 59, 60, 63, 64, 66, 67, 74, 75, 76, 77, 78, 79,
  85, 86, 89, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
  110, 111, 112, 114, 116, 118, 119, 120, 121, 123, 124, 125, 129, 137, 144, 146, 147,
  169, 171, 172, 173, 174, 175, 176, 177, 178, 179, 181, 182, 183, 185, 187,
  201, 212, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 277,
  281, 282, 283, 284, 285, 286, 287, 289, 293, 294, 295, 297, 298, 299,
  300, 302, 303, 305, 306, 307, 311, 312, 314, 317, 318, 319, 320, 323, 324, 325, 326,
  332, 333, 334, 336, 337, 338, 339, 341, 342, 343, 344, 345, 346, 347, 349,
  350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369,
  370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389,
  390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409,
  410, 411, 412, 413, 415, 416, 417, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432,
  451, 453, 454, 458, 459, 460, 461, 462
]

// Unicode emoji 列表（码点 -> 文件名映射）
const EMOJI_LIST: { codePoint: number; char: string }[] = [
  { codePoint: 0x2600, char: '☀' },
  { codePoint: 0x2615, char: '☕' },
  { codePoint: 0x263a, char: '☺' },
  { codePoint: 0x2728, char: '✨' },
  { codePoint: 0x2754, char: '❔' },
  { codePoint: 0x1f339, char: '🌹' },
  { codePoint: 0x1f349, char: '🍉' },
  { codePoint: 0x1f34e, char: '🍎' },
  { codePoint: 0x1f353, char: '🍓' },
  { codePoint: 0x1f35c, char: '🍜' },
  { codePoint: 0x1f35e, char: '🍞' },
  { codePoint: 0x1f367, char: '🍧' },
  { codePoint: 0x1f37a, char: '🍺' },
  { codePoint: 0x1f37b, char: '🍻' },
  { codePoint: 0x1f389, char: '🎉' },
  { codePoint: 0x1f3ea, char: '🏪' },
  { codePoint: 0x1f40e, char: '🐎' },
  { codePoint: 0x1f414, char: '🐔' },
  { codePoint: 0x1f41b, char: '🐛' },
  { codePoint: 0x1f42e, char: '🐮' },
  { codePoint: 0x1f433, char: '🐳' },
  { codePoint: 0x1f435, char: '🐵' },
  { codePoint: 0x1f436, char: '🐶' },
  { codePoint: 0x1f437, char: '🐷' },
  { codePoint: 0x1f438, char: '🐸' },
  { codePoint: 0x1f440, char: '👀' },
  { codePoint: 0x1f446, char: '👆' },
  { codePoint: 0x1f44a, char: '👊' },
  { codePoint: 0x1f44c, char: '👌' },
  { codePoint: 0x1f44d, char: '👍' },
  { codePoint: 0x1f44e, char: '👎' },
  { codePoint: 0x1f44f, char: '👏' },
  { codePoint: 0x1f462, char: '👢' },
  { codePoint: 0x1f466, char: '👦' },
  { codePoint: 0x1f467, char: '👧' },
  { codePoint: 0x1f47b, char: '👻' },
  { codePoint: 0x1f489, char: '💉' },
  { codePoint: 0x1f493, char: '💓' },
  { codePoint: 0x1f49d, char: '💝' },
  { codePoint: 0x1f4a3, char: '💣' },
  { codePoint: 0x1f4a4, char: '💤' },
  { codePoint: 0x1f4a6, char: '💦' },
  { codePoint: 0x1f4a8, char: '💨' },
  { codePoint: 0x1f4a9, char: '💩' },
  { codePoint: 0x1f4aa, char: '💪' },
  { codePoint: 0x1f4eb, char: '📫' },
  { codePoint: 0x1f525, char: '🔥' },
  { codePoint: 0x1f52b, char: '🔫' },
  { codePoint: 0x1f601, char: '😁' },
  { codePoint: 0x1f602, char: '😂' },
  { codePoint: 0x1f604, char: '😄' },
  { codePoint: 0x1f60a, char: '😊' },
  { codePoint: 0x1f60c, char: '😌' },
  { codePoint: 0x1f60d, char: '😍' },
  { codePoint: 0x1f60f, char: '😏' },
  { codePoint: 0x1f612, char: '😒' },
  { codePoint: 0x1f613, char: '😓' },
  { codePoint: 0x1f614, char: '😔' },
  { codePoint: 0x1f618, char: '😘' },
  { codePoint: 0x1f61a, char: '😚' },
  { codePoint: 0x1f61c, char: '😜' },
  { codePoint: 0x1f61d, char: '😝' },
  { codePoint: 0x1f62d, char: '😭' },
  { codePoint: 0x1f630, char: '😰' },
  { codePoint: 0x1f631, char: '😱' },
  { codePoint: 0x1f633, char: '😳' },
  { codePoint: 0x1f64f, char: '🙏' },
  { codePoint: 0x1f6ac, char: '🚬' },
]

const RECENT_EMOJI_KEY = 'webqq_recent_emojis'
const MAX_RECENT = 10

// 最近表情项：type='face' 是 QQ 表情，type='emoji' 是 Unicode emoji
export interface RecentEmojiItem {
  type: 'face' | 'emoji'
  faceId?: number
  codePoint?: number
  char?: string
}

function getRecentEmojis(): RecentEmojiItem[] {
  try {
    const stored = localStorage.getItem(RECENT_EMOJI_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    // 兼容旧格式（纯数字数组）
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number') {
      return parsed.map((id: number) => ({ type: 'face' as const, faceId: id }))
    }
    return parsed
  } catch {
    return []
  }
}

function addRecentEmoji(item: RecentEmojiItem) {
  const recent = getRecentEmojis().filter(r => {
    if (r.type !== item.type) return true
    if (r.type === 'face') return r.faceId !== item.faceId
    return r.codePoint !== item.codePoint
  })
  recent.unshift(item)
  localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

interface EmojiPickerProps {
  onSelect: (faceId: number) => void
  onSelectEmoji?: (emoji: string) => void  // Unicode emoji 回调
  onClose: () => void
  position?: { x: number; y: number }
  inline?: boolean // 内联模式，不使用 absolute 定位
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onSelectEmoji, onClose, position, inline }) => {
  const [loadedFaces, setLoadedFaces] = useState<Set<number>>(new Set())
  const [recentEmojis, setRecentEmojis] = useState<RecentEmojiItem[]>(getRecentEmojis())
  const [activeTab, setActiveTab] = useState<'qq' | 'emoji'>('qq')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSelectFace = (faceId: number) => {
    addRecentEmoji({ type: 'face', faceId })
    setRecentEmojis(getRecentEmojis())
    onSelect(faceId)
  }

  const handleSelectEmoji = (codePoint: number, char: string) => {
    addRecentEmoji({ type: 'emoji', codePoint, char })
    setRecentEmojis(getRecentEmojis())
    if (onSelectEmoji) {
      onSelectEmoji(char)
    }
  }

  // 渲染最近使用的表情项
  const renderRecentItem = (item: RecentEmojiItem, index: number) => {
    if (item.type === 'face' && item.faceId !== undefined) {
      return (
        <button
          key={`recent-face-${item.faceId}`}
          onClick={() => handleSelectFace(item.faceId!)}
          className="w-8 h-8 flex items-center justify-center hover:bg-theme-item rounded transition-colors"
          title={`表情 ${item.faceId}`}
        >
          <img src={`/face/${item.faceId}.png`} alt={`表情${item.faceId}`} className="w-6 h-6" />
        </button>
      )
    }
    if (item.type === 'emoji' && item.char) {
      return (
        <button
          key={`recent-emoji-${item.codePoint}`}
          onClick={() => handleSelectEmoji(item.codePoint!, item.char!)}
          className="w-8 h-8 flex items-center justify-center hover:bg-theme-item rounded transition-colors text-xl"
          title={item.char}
        >
          {item.char}
        </button>
      )
    }
    return null
  }

  return (
    <div 
      ref={pickerRef}
      className={`${inline ? '' : 'absolute bottom-full left-0 mb-2'} bg-theme-card border border-theme-divider rounded-xl shadow-xl z-50`}
      style={position ? { left: position.x, bottom: position.y } : undefined}
    >
      <div className="flex border-b border-theme-divider">
        <button 
          className={`flex-1 px-3 py-2 text-sm ${activeTab === 'qq' ? 'text-pink-500 border-b-2 border-pink-500' : 'text-theme-secondary'}`}
          onClick={() => setActiveTab('qq')}
        >
          QQ表情
        </button>
        <button 
          className={`flex-1 px-3 py-2 text-sm ${activeTab === 'emoji' ? 'text-pink-500 border-b-2 border-pink-500' : 'text-theme-secondary'}`}
          onClick={() => setActiveTab('emoji')}
        >
          Emoji
        </button>
      </div>
      <div className="p-2 max-h-[280px] overflow-y-auto w-[320px]">
        {recentEmojis.length > 0 && (
          <>
            <div className="text-xs text-theme-hint mb-1">最近使用</div>
            <div className="grid grid-cols-8 gap-1 mb-2 pb-2 border-b border-theme-divider">
              {recentEmojis.map((item, index) => renderRecentItem(item, index))}
            </div>
          </>
        )}
        {activeTab === 'qq' ? (
          <div className="grid grid-cols-8 gap-1">
            {FACE_IDS.map(faceId => (
              <button
                key={faceId}
                onClick={() => handleSelectFace(faceId)}
                className="w-8 h-8 flex items-center justify-center hover:bg-theme-item rounded transition-colors"
                title={`表情 ${faceId}`}
              >
                <img
                  src={`/face/${faceId}.png`}
                  alt={`表情${faceId}`}
                  className={`w-6 h-6 transition-opacity ${loadedFaces.has(faceId) ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setLoadedFaces(prev => new Set(prev).add(faceId))}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_LIST.map(({ codePoint, char }) => (
              <button
                key={codePoint}
                onClick={() => handleSelectEmoji(codePoint, char)}
                className="w-8 h-8 flex items-center justify-center hover:bg-theme-item rounded transition-colors text-xl"
                title={char}
              >
                {char}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default EmojiPicker
