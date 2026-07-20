import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Loader2 } from 'lucide-react'
import { useWebQQStore } from '../../../stores/webqqStore'

export interface ForwardTarget {
  chatType: number
  peerId: string
  name: string
  avatar: string
}

interface ForwardTargetPickerProps {
  // 转发的消息条数, 用于标题提示 (1=单条, >1=合并转发)
  count: number
  onSelect: (target: ForwardTarget) => void
  onClose: () => void
  sending?: boolean
}

// 转发目标选择器: 合并 最近会话 + 好友 + 群, 带搜索, 点击某项即回调 onSelect.
const ForwardTargetPicker: React.FC<ForwardTargetPickerProps> = ({ count, onSelect, onClose, sending }) => {
  const { recentChats, friendCategories, groups } = useWebQQStore()
  const [query, setQuery] = useState('')

  const candidates = useMemo<ForwardTarget[]>(() => {
    const seen = new Set<string>()
    const list: ForwardTarget[] = []
    const add = (t: ForwardTarget) => {
      // 只允许私聊(1) / 群(2) 作为转发目标, 排除临时会话等
      if (t.chatType !== 1 && t.chatType !== 2) return
      const key = `${t.chatType}_${t.peerId}`
      if (seen.has(key)) return
      seen.add(key)
      list.push(t)
    }
    // 最近会话优先
    for (const r of recentChats) {
      add({ chatType: r.chatType, peerId: r.peerId, name: r.peerName, avatar: r.peerAvatar })
    }
    for (const g of groups) {
      add({ chatType: 2, peerId: g.groupCode, name: g.remarkName || g.groupName, avatar: g.avatar })
    }
    for (const cat of friendCategories) {
      for (const f of cat.friends) {
        add({ chatType: 1, peerId: f.uin, name: f.remark || f.nickname, avatar: f.avatar })
      }
    }
    return list
  }, [recentChats, friendCategories, groups])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(t => t.name.toLowerCase().includes(q) || t.peerId.includes(q))
  }, [candidates, query])

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={sending ? undefined : onClose} />
      <div className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-neutral-800 border border-theme-divider rounded-2xl shadow-xl w-[360px] max-w-[92vw] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
          <div className="font-medium text-theme">转发到{count > 1 ? `（合并 ${count} 条）` : ''}</div>
          <button onClick={onClose} disabled={sending} className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>
        <div className="p-3 border-b border-theme-divider">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索会话 / 好友 / 群"
              className="w-full pl-9 pr-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme placeholder:text-theme-hint"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1 relative">
          {sending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-neutral-800/60">
              <Loader2 size={24} className="animate-spin text-pink-500" />
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-theme-hint text-sm">未找到会话</div>
          ) : (
            filtered.map(t => (
              <button
                key={`${t.chatType}_${t.peerId}`}
                onClick={() => onSelect(t)}
                disabled={sending}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-theme-item-hover transition-colors text-left disabled:opacity-50"
              >
                <img
                  src={t.avatar}
                  alt={t.name}
                  loading="lazy"
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  onError={(e) => { e.currentTarget.src = t.chatType === 2 ? `https://p.qlogo.cn/gh/${t.peerId}/${t.peerId}/100/` : `https://q1.qlogo.cn/g?b=qq&nk=${t.peerId}&s=100` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-theme truncate">{t.name}</div>
                  <div className="text-xs text-theme-hint truncate">{t.chatType === 2 ? '群聊' : '好友'} · {t.peerId}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

export default ForwardTargetPicker
