import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Search, Crown, Shield, Loader2 } from 'lucide-react'
import type { GroupMemberItem } from '../../types/webqq'
import { getGroupMembers, filterMembers } from '../../utils/webqqApi'
import { useWebQQStore } from '../../stores/webqqStore'
import { showToast } from '../Toast'

interface GroupMemberPanelProps {
  groupCode: string
  onClose: () => void
}

const GroupMemberPanel: React.FC<GroupMemberPanelProps> = ({ groupCode, onClose }) => {
  const [members, setMembers] = useState<GroupMemberItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // 使用 store 的缓存
  const { getCachedMembers, setCachedMembers } = useWebQQStore()

  // 加载群成员
  const loadMembers = useCallback(async () => {
    // 先从缓存加载
    const cachedMembers = getCachedMembers(groupCode)
    if (cachedMembers && cachedMembers.length > 0) {
      setMembers(cachedMembers)
      // 后台静默刷新
      refreshMembers()
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const data = await getGroupMembers(groupCode)
      setMembers(data)
      setCachedMembers(groupCode, data)
    } catch (e: any) {
      setError(e.message || '加载群成员失败')
      showToast('加载群成员失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [groupCode, getCachedMembers, setCachedMembers])
  
  // 后台静默刷新
  const refreshMembers = useCallback(async () => {
    try {
      const data = await getGroupMembers(groupCode)
      setMembers(data)
      setCachedMembers(groupCode, data)
    } catch (e) {
      // 静默刷新失败不显示错误
      console.error('Failed to refresh members:', e)
    }
  }, [groupCode, setCachedMembers])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  // 过滤后的成员列表
  const filteredMembers = useMemo(() => filterMembers(members, searchQuery), [members, searchQuery])

  // 统计各角色人数
  const stats = useMemo(() => {
    const owner = members.filter(m => m.role === 'owner').length
    const admin = members.filter(m => m.role === 'admin').length
    const member = members.filter(m => m.role === 'member').length
    return { owner, admin, member, total: members.length }
  }, [members])

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/50">
        <div>
          <div className="font-medium text-gray-800">群成员</div>
          <div className="text-xs text-gray-400">{stats.total} 人</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成员..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100/50 border border-gray-200/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50"
          />
        </div>
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-pink-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={loadMembers}
              className="text-sm text-pink-500 hover:text-pink-600"
            >
              重试
            </button>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            {searchQuery ? '未找到匹配的成员' : '暂无成员'}
          </div>
        ) : (
          <div className="py-1">
            {filteredMembers.map(member => (
              <MemberListItem key={member.uid} member={member} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 成员列表项
interface MemberListItemProps {
  member: GroupMemberItem
}

export const MemberListItem: React.FC<MemberListItemProps> = ({ member }) => {
  const displayName = member.card || member.nickname
  const roleIcon = member.role === 'owner' ? (
    <Crown size={14} className="text-yellow-500" />
  ) : member.role === 'admin' ? (
    <Shield size={14} className="text-blue-500" />
  ) : null

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50/50 transition-colors">
      <img
        src={member.avatar}
        alt={displayName}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
          e.currentTarget.src = `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=640`
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-800 truncate">{displayName}</span>
          {roleIcon}
        </div>
        {member.card && member.card !== member.nickname && (
          <div className="text-xs text-gray-400 truncate">{member.nickname}</div>
        )}
      </div>
    </div>
  )
}

export default GroupMemberPanel
