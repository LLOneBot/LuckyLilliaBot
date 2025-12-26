import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Crown, Shield, Loader2, AtSign, Hand, User, Star, Moon, Sun } from 'lucide-react'
import type { GroupMemberItem } from '../../types/webqq'
import { getGroupMembers, filterMembers, sendPoke, getUserProfile, UserProfile } from '../../utils/webqqApi'
import { useWebQQStore } from '../../stores/webqqStore'
import { showToast } from '../Toast'

interface GroupMemberPanelProps {
  groupCode: string
  onClose: () => void
  onAtMember?: (name: string) => void
}

// 右键菜单信息
interface MemberContextMenuInfo {
  x: number
  y: number
  member: GroupMemberItem
}

// 用户资料卡组件
const UserProfileCard: React.FC<{ 
  profile: UserProfile | null
  loading: boolean
  position: { x: number; y: number }
  onClose: () => void 
}> = ({ profile, loading, position, onClose }) => {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = React.useState({ left: position.x, top: position.y })
  
  React.useEffect(() => {
    if (!cardRef.current) return
    
    const cardWidth = 320
    const cardHeight = cardRef.current.offsetHeight || 400
    let left = position.x
    let top = position.y
    
    if (left + cardWidth > window.innerWidth - 20) {
      left = window.innerWidth - cardWidth - 20
    }
    if (left < 20) left = 20
    if (top + cardHeight > window.innerHeight - 20) {
      top = window.innerHeight - cardHeight - 20
    }
    if (top < 20) top = 20
    
    setAdjustedPosition({ left, top })
  }, [position, profile, loading])
  
  if (!profile && !loading) return null
  
  const getSexText = (sex: number) => {
    if (sex === 1) return '男'
    if (sex === 2) return '女'
    return ''
  }
  
  const getQAge = (regTime?: number) => {
    if (!regTime) return ''
    const regDate = new Date(regTime * 1000)
    const now = new Date()
    const years = now.getFullYear() - regDate.getFullYear()
    const months = now.getMonth() - regDate.getMonth()
    const totalYears = years + (months < 0 ? -1 : 0)
    if (totalYears < 1) {
      const totalMonths = years * 12 + months
      return totalMonths > 0 ? `${totalMonths}个月` : '不足1个月'
    }
    return `${totalYears}年`
  }
  
  const getRoleText = (role?: 'owner' | 'admin' | 'member') => {
    if (role === 'owner') return '群主'
    if (role === 'admin') return '管理员'
    return ''
  }
  
  const getRoleBadgeClass = (role?: 'owner' | 'admin' | 'member') => {
    if (role === 'owner') return 'bg-amber-500 text-white'
    if (role === 'admin') return 'bg-green-500 text-white'
    return ''
  }
  
  // QQ等级图标组件：4进制 - 4级=1星，16级=1月亮，64级=1太阳，256级=1皇冠，1024级=1金企鹅
  const QQLevelIcons: React.FC<{ level: number }> = ({ level }) => {
    const stars = level % 4
    const moons = Math.floor(level / 4) % 4
    const suns = Math.floor(level / 16) % 4
    const crowns = Math.floor(level / 64) % 4
    const penguins = Math.floor(level / 256)
    
    const icons: React.ReactNode[] = []
    
    for (let i = 0; i < penguins; i++) {
      icons.push(<span key={`penguin-${i}`} className="text-amber-400 text-xs font-bold" title="金企鹅">🐧</span>)
    }
    for (let i = 0; i < crowns; i++) {
      icons.push(<Crown key={`crown-${i}`} size={14} className="text-amber-500" />)
    }
    for (let i = 0; i < suns; i++) {
      icons.push(<Sun key={`sun-${i}`} size={14} className="text-orange-400" />)
    }
    for (let i = 0; i < moons; i++) {
      icons.push(<Moon key={`moon-${i}`} size={14} className="text-blue-400" />)
    }
    for (let i = 0; i < stars; i++) {
      icons.push(<Star key={`star-${i}`} size={14} className="text-yellow-400 fill-yellow-400" />)
    }
    
    return <div className="flex items-center gap-0.5 flex-wrap">{icons}</div>
  }
  
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return ''
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={cardRef}
        className="fixed z-50 border border-theme-divider rounded-xl shadow-xl overflow-hidden bg-popup backdrop-blur-sm"
        style={{ left: adjustedPosition.left, top: adjustedPosition.top, width: 320, maxHeight: 'calc(100vh - 40px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-pink-500" />
          </div>
        ) : profile && (
          <>
            <div className="bg-gradient-to-r from-pink-400 to-amber-300 p-4">
              <div className="flex items-start gap-4">
                <img 
                  src={profile.avatar} 
                  alt={profile.nickname}
                  className="w-16 h-16 rounded-full border-3 border-white/80 object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0 text-white pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg truncate">{profile.nickname}</span>
                    {profile.groupRole && getRoleText(profile.groupRole) && (
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getRoleBadgeClass(profile.groupRole)}`}>
                        {getRoleText(profile.groupRole)}
                      </span>
                    )}
                  </div>
                  {profile.remark && profile.remark !== profile.nickname && (
                    <div className="text-white/80 text-sm truncate mb-1">备注: {profile.remark}</div>
                  )}
                  <div className="text-white/90 text-sm">{profile.uin}</div>
                  {profile.qid && (
                    <div className="text-white/70 text-xs mt-0.5">QID: {profile.qid}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4">
              {profile.signature && (
                <div className="text-theme-secondary text-sm mb-3 bg-theme-item/50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto break-words">
                  {profile.signature}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {getSexText(profile.sex) && (
                  <>
                    <span className="text-theme-hint">性别</span>
                    <span className="text-theme">{getSexText(profile.sex)}</span>
                  </>
                )}
                {profile.birthday && profile.birthday !== '0-0-0' && (
                  <>
                    <span className="text-theme-hint">生日</span>
                    <span className="text-theme">{profile.birthday}</span>
                  </>
                )}
                {getQAge(profile.regTime) && (
                  <>
                    <span className="text-theme-hint">Q龄</span>
                    <span className="text-theme">{getQAge(profile.regTime)}</span>
                  </>
                )}
                {profile.level > 0 && (
                  <>
                    <span className="text-theme-hint">等级</span>
                    <div className="flex items-center gap-2">
                      <span className="text-theme">Lv.{profile.level}</span>
                      <QQLevelIcons level={profile.level} />
                    </div>
                  </>
                )}
              </div>
              {(profile.groupCard || profile.groupTitle || profile.groupLevel) && (
                <>
                  <div className="border-t border-theme-divider my-3" />
                  <div className="text-xs text-theme-hint mb-2">群信息</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {profile.groupCard && (
                      <>
                        <span className="text-theme-hint">群名片</span>
                        <span className="text-theme truncate">{profile.groupCard}</span>
                      </>
                    )}
                    {profile.groupTitle && (
                      <>
                        <span className="text-theme-hint">群头衔</span>
                        <span className="text-pink-500">{profile.groupTitle}</span>
                      </>
                    )}
                    {profile.groupLevel !== undefined && profile.groupLevel > 0 && (
                      <>
                        <span className="text-theme-hint">群等级</span>
                        <span className="text-theme">Lv.{profile.groupLevel}</span>
                      </>
                    )}
                    {profile.joinTime && (
                      <>
                        <span className="text-theme-hint">入群时间</span>
                        <span className="text-theme">{formatTime(profile.joinTime)}</span>
                      </>
                    )}
                    {profile.lastSpeakTime && (
                      <>
                        <span className="text-theme-hint">最后发言</span>
                        <span className="text-theme">{formatTime(profile.lastSpeakTime)}</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  )
}

const GroupMemberPanel: React.FC<GroupMemberPanelProps> = ({ groupCode, onClose, onAtMember }) => {
  const [members, setMembers] = useState<GroupMemberItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<MemberContextMenuInfo | null>(null)
  const [userProfile, setUserProfile] = useState<{ profile: UserProfile | null; loading: boolean; position: { x: number; y: number } } | null>(null)
  
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

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent, member: GroupMemberItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, member })
  }, [])

  const handleAtMember = useCallback(() => {
    if (contextMenu && onAtMember) {
      const name = contextMenu.member.card || contextMenu.member.nickname
      onAtMember(name)
    }
    setContextMenu(null)
  }, [contextMenu, onAtMember])

  const handlePoke = useCallback(async () => {
    if (!contextMenu) return
    const member = contextMenu.member
    setContextMenu(null)
    try {
      await sendPoke(2, Number(member.uin), Number(groupCode))
      showToast('戳一戳成功', 'success')
    } catch (e: any) {
      showToast(e.message || '戳一戳失败', 'error')
    }
  }, [contextMenu, groupCode])

  const handleViewProfile = useCallback(async () => {
    if (!contextMenu) return
    const member = contextMenu.member
    const pos = { x: contextMenu.x, y: contextMenu.y }
    setContextMenu(null)
    setUserProfile({ profile: null, loading: true, position: pos })
    try {
      const profile = await getUserProfile(member.uid, member.uin, groupCode)
      setUserProfile({ profile, loading: false, position: pos })
    } catch (e: any) {
      showToast(e.message || '获取资料失败', 'error')
      setUserProfile(null)
    }
  }, [contextMenu, groupCode])

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
        <div>
          <div className="font-medium text-theme">群成员</div>
          <div className="text-xs text-theme-hint">{stats.total} 人</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成员..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme placeholder:text-theme-hint"
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
          <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
            {searchQuery ? '未找到匹配的成员' : '暂无成员'}
          </div>
        ) : (
          <div className="py-1">
            {filteredMembers.map(member => (
              <MemberListItem 
                key={member.uid} 
                member={member} 
                onContextMenu={(e) => handleContextMenu(e, member)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }} />
          <div
            className="fixed z-50 bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: Math.min(contextMenu.y, window.innerHeight - 150) }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {onAtMember && (
              <button
                onClick={handleAtMember}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
              >
                <AtSign size={14} />
                @ta
              </button>
            )}
            <button
              onClick={handlePoke}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
            >
              <Hand size={14} />
              戳一戳
            </button>
            <button
              onClick={handleViewProfile}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-theme hover:bg-theme-item-hover transition-colors"
            >
              <User size={14} />
              查看资料
            </button>
          </div>
        </>,
        document.body
      )}

      {/* 用户资料卡 */}
      {userProfile && (
        <UserProfileCard
          profile={userProfile.profile}
          loading={userProfile.loading}
          position={userProfile.position}
          onClose={() => setUserProfile(null)}
        />
      )}
    </div>
  )
}

// 成员列表项
interface MemberListItemProps {
  member: GroupMemberItem
  onContextMenu?: (e: React.MouseEvent) => void
}

export const MemberListItem: React.FC<MemberListItemProps> = ({ member, onContextMenu }) => {
  const displayName = member.card || member.nickname
  const roleIcon = member.role === 'owner' ? (
    <Crown size={14} className="text-yellow-500" />
  ) : member.role === 'admin' ? (
    <Shield size={14} className="text-blue-500" />
  ) : null

  return (
    <div 
      className="flex items-center gap-3 px-3 py-2 hover:bg-theme-item-hover transition-colors cursor-pointer"
      onContextMenu={onContextMenu}
    >
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
          <span className="text-sm text-theme truncate">{displayName}</span>
          {roleIcon}
        </div>
        {member.card && member.card !== member.nickname && (
          <div className="text-xs text-theme-hint truncate">{member.nickname}</div>
        )}
      </div>
    </div>
  )
}

export default GroupMemberPanel
