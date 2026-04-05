import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { X, Search, Crown, Shield, Loader2 } from 'lucide-react'
import type { GroupMemberItem } from '../../../types/webqq'
import { filterMembers, sendPoke, getUserProfile, UserProfile, getSelfUid, kickGroupMember, muteGroupMember, setMemberTitle } from '../../../utils/webqqApi'
import { useWebQQStore, hasVisitedChat, hasFetchedMembers, markMembersFetched } from '../../../stores/webqqStore'
import { showToast } from '../../common'
import { UserProfileCard } from '../profile'
import { AvatarContextMenu } from '../chat/ContextMenus'
import { MuteDialog, KickConfirmDialog, TitleDialog } from '../chat/ChatDialogs'

interface GroupMemberPanelProps {
  groupCode: string
  onClose: () => void
  onAtMember?: (member: { uid: string; uin: string; name: string }) => void
}

interface MemberListItemProps {
  member: GroupMemberItem
  onContextMenu?: (e: React.MouseEvent) => void
  onClick?: (e: React.MouseEvent) => void
}

const MemberListItem: React.FC<MemberListItemProps> = ({ member, onContextMenu, onClick }) => {
  const displayName = member.card || member.nickname
  const roleIcon = member.role === 'owner' ? (
    <Crown size={14} className="text-yellow-500" />
  ) : member.role === 'admin' ? (
    <Shield size={14} className="text-blue-500" />
  ) : null

  // 移动端单击触发菜单
  const handleClick = (e: React.MouseEvent) => {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      onClick?.(e)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-theme-item-hover transition-colors cursor-pointer" onClick={handleClick} onContextMenu={onContextMenu}>
      <img src={member.avatar} alt={displayName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" loading="lazy" onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=640` }} />
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

interface AvatarMenuInfo {
  x: number
  y: number
  senderUid: string
  senderUin: string
  senderName: string
  chatType: number
  groupCode: string
}

const GroupMemberPanel: React.FC<GroupMemberPanelProps> = ({ groupCode, onClose, onAtMember }) => {
  const [members, setMembers] = useState<GroupMemberItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [avatarContextMenu, setAvatarContextMenu] = useState<AvatarMenuInfo | null>(null)
  const [userProfile, setUserProfile] = useState<{ profile: UserProfile | null; loading: boolean; position: { x: number; y: number } } | null>(null)
  const [muteDialog, setMuteDialog] = useState<{ uid: string; name: string } | null>(null)
  const [kickConfirm, setKickConfirm] = useState<{ uid: string; name: string } | null>(null)
  const [titleDialog, setTitleDialog] = useState<{ uid: string; name: string } | null>(null)

  const { getCachedMembers, fetchGroupMembers, currentChat } = useWebQQStore()

  // 虚拟列表容器 ref
  const listContainerRef = useRef<HTMLDivElement>(null)

  // 用 ref 跟踪当前 groupCode，用于异步回调检查
  const currentGroupCodeRef = useRef(groupCode)
  useEffect(() => { currentGroupCodeRef.current = groupCode }, [groupCode])

  // 用 ref 存储函数避免依赖变化
  const getCachedMembersRef = useRef(getCachedMembers)
  getCachedMembersRef.current = getCachedMembers
  const fetchGroupMembersRef = useRef(fetchGroupMembers)
  fetchGroupMembersRef.current = fetchGroupMembers
  const isLoadingRef = useRef(false)

  // 加载群成员 - 只依赖 groupCode
  useEffect(() => {
    const targetGroupCode = groupCode

    // 检查是否首次进入该聊天 且 该群成员还没拉取过
    const isFirstVisit = !hasVisitedChat(2, targetGroupCode)
    const alreadyFetched = hasFetchedMembers(targetGroupCode)

    console.log('[GroupMemberPanel] useEffect triggered:', { groupCode: targetGroupCode, isFirstVisit, alreadyFetched })

    // 先检查缓存（同步）- 有缓存就先显示
    const cached = getCachedMembersRef.current(targetGroupCode)
    if (cached) {
      console.log('[GroupMemberPanel] Cache hit:', cached.length, 'members')
      setMembers(cached)
      setError(null)

      // 如果已经拉取过，直接使用缓存
      if (alreadyFetched) {
        setLoading(false)
        return
      }
      // 首次访问且未拉取过：显示缓存但继续后台刷新
    }

    // 如果已经拉取过，不再请求
    if (alreadyFetched) {
      setLoading(false)
      return
    }

    // 防止重复加载
    if (isLoadingRef.current) {
      console.log('[GroupMemberPanel] Already loading, skip')
      return
    }

    // 需要加载
    console.log('[GroupMemberPanel] Fetching from API, isFirstVisit:', isFirstVisit)
    isLoadingRef.current = true
    // 如果没有缓存才显示 loading
    if (!cached) {
      setLoading(true)
      setError(null)
      setMembers([])
    }

    fetchGroupMembersRef.current(targetGroupCode, isFirstVisit)
      .then(data => {
        console.log('[GroupMemberPanel] API success:', data.length, 'members, currentGroupCode:', currentGroupCodeRef.current)
        if (currentGroupCodeRef.current === targetGroupCode) {
          setMembers(data)
          setLoading(false)
          // 标记已拉取
          markMembersFetched(targetGroupCode)
        }
      })
      .catch((e) => {
        console.log('[GroupMemberPanel] API error:', e.message)
        if (currentGroupCodeRef.current === targetGroupCode) {
          // 如果有缓存，错误时不覆盖
          if (!cached) {
            setError(e.message || '加载群成员失败')
          }
          showToast('加载群成员失败', 'error')
          setLoading(false)
        }
      })
      .finally(() => {
        if (currentGroupCodeRef.current === targetGroupCode) {
          isLoadingRef.current = false
        }
      })

    // 清理函数：切换群时重置加载状态
    return () => {
      console.log('[GroupMemberPanel] Cleanup, reset isLoading')
      isLoadingRef.current = false
    }
  }, [groupCode])  // 只依赖 groupCode

  const filteredMembers = useMemo(() => filterMembers(members, searchQuery), [members, searchQuery])

  // 虚拟列表
  const virtualizer = useVirtualizer({
    count: filteredMembers.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 48, // 每行高度约 48px
    overscan: 5,
  })

  const stats = useMemo(() => {
    const owner = members.filter(m => m.role === 'owner').length
    const admin = members.filter(m => m.role === 'admin').length
    return { owner, admin, total: members.length }
  }, [members])

  const handleContextMenu = useCallback((e: React.MouseEvent, member: GroupMemberItem) => {
    e.preventDefault()
    e.stopPropagation()
    setAvatarContextMenu({
      x: e.clientX,
      y: e.clientY,
      senderUid: member.uid,
      senderUin: member.uin,
      senderName: member.card || member.nickname,
      chatType: 2,
      groupCode,
    })
  }, [groupCode])

  const handleShowProfile = useCallback(async (uid: string, uin: string, x: number, y: number, gCode?: string) => {
    const pos = { x, y }
    setUserProfile({ profile: null, loading: true, position: pos })
    try {
      const profile = await getUserProfile(uid, uin, gCode)
      setUserProfile({ profile, loading: false, position: pos })
    } catch (e) {
      showToast(e.message || '获取资料失败', 'error')
      setUserProfile(null)
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
        <div>
          <div className="font-medium text-theme">群成员</div>
          <div className="text-xs text-theme-hint">{stats.total} 人</div>
        </div>
        <button onClick={onClose} className="p-1.5 text-theme-hint hover:text-theme hover:bg-theme-item rounded-lg transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索成员..." className="w-full pl-9 pr-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme placeholder:text-theme-hint" />
        </div>
      </div>

      <div ref={listContainerRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-pink-500" /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={() => fetchGroupMembers(groupCode)} className="text-sm text-pink-500 hover:text-pink-600">重试</button>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-theme-hint text-sm">{searchQuery ? '未找到匹配的成员' : '暂无成员'}</div>
        ) : (
          <div className="py-1 relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const member = filteredMembers[virtualRow.index]
              return (
                <div
                  key={member.uid}
                  className="absolute left-0 right-0"
                  style={{ top: virtualRow.start, height: virtualRow.size }}
                >
                  <MemberListItem
                    member={member}
                    onClick={(e) => handleContextMenu(e, member)}
                    onContextMenu={(e) => handleContextMenu(e, member)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 复用 AvatarContextMenu，与聊天窗口头像右键菜单一致 */}
      {avatarContextMenu && (
        <AvatarContextMenu
          avatarContextMenu={avatarContextMenu}
          getCachedMembers={getCachedMembers}
          onClose={() => setAvatarContextMenu(null)}
          onInsertAt={(uid, uin, name) => {
            onAtMember?.({ uid, uin, name })
          }}
          onShowProfile={handleShowProfile}
          onSetTitle={(uid, name) => setTitleDialog({ uid, name })}
          onMute={(uid, name) => setMuteDialog({ uid, name })}
          onKick={(uid, name) => setKickConfirm({ uid, name })}
          onAdminChanged={() => fetchGroupMembers(groupCode, true)}
          groupName={currentChat?.peerName}
        />
      )}

      {userProfile && (
        <UserProfileCard profile={userProfile.profile} loading={userProfile.loading} position={userProfile.position} onClose={() => setUserProfile(null)} />
      )}

      {muteDialog && (
        <MuteDialog
          name={muteDialog.name}
          onMute={async (seconds) => {
            const { uid, name } = muteDialog
            setMuteDialog(null)
            try {
              await muteGroupMember(groupCode, uid, seconds)
              if (seconds === 0) {
                showToast(`已解除 ${name} 的禁言`, 'success')
              } else {
                const display = seconds >= 86400 ? `${Math.floor(seconds / 86400)}天` :
                  seconds >= 3600 ? `${Math.floor(seconds / 3600)}小时` :
                  seconds >= 60 ? `${Math.floor(seconds / 60)}分钟` : `${seconds}秒`
                showToast(`已禁言 ${name} ${display}`, 'success')
              }
            } catch (e) {
              showToast(e.message || '禁言失败', 'error')
            }
          }}
          onClose={() => setMuteDialog(null)}
        />
      )}

      {kickConfirm && (
        <KickConfirmDialog
          name={kickConfirm.name}
          groupName={currentChat?.peerName || groupCode}
          onConfirm={async () => {
            const { uid, name } = kickConfirm
            setKickConfirm(null)
            try {
              await kickGroupMember(groupCode, uid)
              showToast(`已将 ${name} 移出群聊`, 'success')
            } catch (e) {
              showToast(e.message || '踢出失败', 'error')
            }
          }}
          onClose={() => setKickConfirm(null)}
        />
      )}

      {titleDialog && (
        <TitleDialog
          name={titleDialog.name}
          onConfirm={async (title) => {
            const { uid, name } = titleDialog
            setTitleDialog(null)
            try {
              await setMemberTitle(groupCode, uid, title)
              showToast(title ? `已设置 ${name} 的头衔为「${title}」` : `已清除 ${name} 的头衔`, 'success')
            } catch (e) {
              showToast(e.message || '设置头衔失败', 'error')
            }
          }}
          onClose={() => setTitleDialog(null)}
        />
      )}
    </div>
  )
}

export default GroupMemberPanel
