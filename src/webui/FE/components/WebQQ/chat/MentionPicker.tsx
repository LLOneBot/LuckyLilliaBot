import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Crown, Shield, Loader2 } from 'lucide-react'
import type { GroupMemberItem } from '../../../types/webqq'

interface MentionPickerProps {
  members: GroupMemberItem[]
  loading: boolean
  query: string  // @ 后面输入的过滤文字
  position: { top: number; left: number }
  onSelect: (member: GroupMemberItem) => void
  onClose: () => void
}

export const MentionPicker: React.FC<MentionPickerProps> = ({
  members,
  loading,
  query,
  onSelect,
  onClose
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 过滤成员
  const filteredMembers = useMemo(() => {
    if (!query) return members.slice(0, 20) // 默认显示前20个
    const lowerQuery = query.toLowerCase()
    return members.filter(m =>
      m.nickname.toLowerCase().includes(lowerQuery) ||
      m.card?.toLowerCase().includes(lowerQuery) ||
      m.uin.includes(query)
    ).slice(0, 20)
  }, [members, query])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filteredMembers.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredMembers[selectedIndex]) {
          onSelect(filteredMembers[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredMembers, selectedIndex, onSelect, onClose])

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // 滚动选中项到可见区域
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const selectedEl = container.querySelector(`[data-index="${selectedIndex}"]`)
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown size={12} className="text-yellow-500" />
    if (role === 'admin') return <Shield size={12} className="text-green-500" />
    return null
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-theme-divider overflow-hidden"
      style={{ bottom: '100%', left: 0, marginBottom: 8, minWidth: 240, maxWidth: 300 }}
    >
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={20} className="animate-spin text-pink-500" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="py-3 px-4 text-sm text-theme-muted text-center">
          {query ? '没有匹配的成员' : '暂无成员'}
        </div>
      ) : (
        <div className="max-h-[200px] overflow-y-auto py-1">
          {filteredMembers.map((member, index) => (
            <div
              key={member.uid}
              data-index={index}
              onClick={() => onSelect(member)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                index === selectedIndex
                  ? 'bg-pink-50 dark:bg-pink-900/30'
                  : 'hover:bg-theme-item-hover'
              }`}
            >
              <img
                src={member.avatar || `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=40`}
                alt=""
                className="w-7 h-7 rounded-full flex-shrink-0"
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-theme truncate">
                    {member.card || member.nickname}
                  </span>
                  {getRoleIcon(member.role)}
                </div>
                {member.card && member.card !== member.nickname && (
                  <div className="text-xs text-theme-muted truncate">
                    {member.nickname}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MentionPicker
