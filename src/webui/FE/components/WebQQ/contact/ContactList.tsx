import React, { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Users, MessageCircle, Search, Clock, ChevronDown, ChevronRight, Pin, Trash2 } from 'lucide-react'
import type { FriendItem, FriendCategory, GroupItem, RecentChatItem } from '../../../types/webqq'
import { filterGroups, formatMessageTime } from '../../../utils/webqqApi'
import { useWebQQStore } from '../../../stores/webqqStore'
import { FriendListItem, GroupListItem, useMenuPosition, GroupMsgMaskMenu } from './ListItems'

type TabType = 'friends' | 'groups' | 'recent'

interface ContactListProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  friendCategories: FriendCategory[]
  groups: GroupItem[]
  recentChats: RecentChatItem[]
  unreadCounts: Map<string, number>
  selectedPeerId?: string
  onSelectFriend: (friend: FriendItem) => void
  onSelectGroup: (group: GroupItem) => void
  onSelectRecent: (recent: RecentChatItem) => void
}

const ContactList: React.FC<ContactListProps> = ({
  activeTab,
  onTabChange,
  friendCategories,
  groups,
  recentChats,
  unreadCounts,
  selectedPeerId,
  onSelectFriend,
  onSelectGroup,
  onSelectRecent
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const { groupAssistantMode, enterGroupAssistant, exitGroupAssistant } = useWebQQStore()
  
  // 单独订阅 groupLastTimeMap 以确保更新时触发重新渲染
  const groupLastTimeMap = useWebQQStore(state => state.groupLastTimeMap)
  const groupLastMessageMap = useWebQQStore(state => state.groupLastMessageMap)

  // 过滤后的好友分组
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return friendCategories
    const lowerQuery = searchQuery.toLowerCase()
    return friendCategories.map(category => ({
      ...category,
      friends: category.friends.filter(friend =>
        friend.nickname.toLowerCase().includes(lowerQuery) ||
        friend.remark.toLowerCase().includes(lowerQuery) ||
        friend.uin.includes(searchQuery)
      )
    })).filter(category => category.friends.length > 0)
  }, [friendCategories, searchQuery])

  const filteredGroups = useMemo(() => filterGroups(groups, searchQuery), [groups, searchQuery])

  const tabs = [
    { id: 'recent' as TabType, icon: Clock, label: '最近' },
    { id: 'friends' as TabType, icon: Users, label: '好友' },
    { id: 'groups' as TabType, icon: MessageCircle, label: '群组' }
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Tab 切换 */}
      <div className="flex border-b border-theme-divider px-2 pt-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                isActive
                  ? 'text-pink-600 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-900/30'
                  : 'text-theme-muted hover:text-theme hover:bg-theme-item'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 搜索框 */}
      {activeTab !== 'recent' && (
        <div className="p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'friends' ? '搜索好友...' : '搜索群组...'}
              className="w-full pl-9 pr-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme placeholder:text-theme-hint"
            />
          </div>
        </div>
      )}

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'recent' && groupAssistantMode === 'normal' && (
          <RecentList
            items={recentChats}
            unreadCounts={unreadCounts}
            selectedPeerId={selectedPeerId}
            onSelect={onSelectRecent}
            onEnterGroupAssistant={enterGroupAssistant}
          />
        )}
        {activeTab === 'recent' && groupAssistantMode === 'assistant' && (
          <GroupAssistantList
            groups={groups}
            recentChats={recentChats}
            groupLastTimeMap={groupLastTimeMap}
            groupLastMessageMap={groupLastMessageMap}
            unreadCounts={unreadCounts}
            selectedPeerId={selectedPeerId}
            onSelect={onSelectGroup}
            onBack={exitGroupAssistant}
          />
        )}
        {activeTab === 'friends' && (
          <FriendCategoryList
            categories={filteredCategories}
            selectedPeerId={selectedPeerId}
            onSelect={onSelectFriend}
          />
        )}
        {activeTab === 'groups' && (
          <GroupList
            items={filteredGroups}
            unreadCounts={unreadCounts}
            groupLastTimeMap={groupLastTimeMap}
            selectedPeerId={selectedPeerId}
            onSelect={onSelectGroup}
          />
        )}
      </div>
    </div>
  )
}

// 好友分组列表
interface FriendCategoryListProps {
  categories: FriendCategory[]
  selectedPeerId?: string
  onSelect: (friend: FriendItem) => void
}

const FriendCategoryList: React.FC<FriendCategoryListProps> = ({ categories, selectedPeerId, onSelect }) => {
  // 使用 store 管理展开状态
  const { expandedCategories, toggleCategory } = useWebQQStore()
  const expandedSet = useMemo(() => new Set(expandedCategories), [expandedCategories])

  // 对每个分组的好友按置顶状态排序
  const sortedCategories = useMemo(() => {
    return categories.map(category => ({
      ...category,
      friends: [...category.friends].sort((a, b) => {
        const aIsTop = !!(a.topTime && a.topTime !== '0')
        const bIsTop = !!(b.topTime && b.topTime !== '0')
        if (aIsTop && !bIsTop) return -1
        if (!aIsTop && bIsTop) return 1
        return 0
      })
    }))
  }, [categories])

  if (sortedCategories.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
        暂无好友
      </div>
    )
  }

  return (
    <div className="py-1">
      {sortedCategories.map(category => {
        const isExpanded = expandedSet.has(category.categoryId)
        return (
          <div key={category.categoryId}>
            {/* 分组标题 */}
            <div
              onClick={() => toggleCategory(category.categoryId)}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-theme-item-hover text-theme-secondary"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-xs font-medium">{category.categoryName}</span>
              <span className="text-xs text-theme-hint">
                {category.onlineCount}/{category.memberCount}
              </span>
            </div>
            {/* 好友列表 */}
            {isExpanded && category.friends.map(friend => (
              <FriendListItem
                key={friend.uid}
                friend={friend}
                isSelected={selectedPeerId === friend.uin}
                onClick={() => onSelect(friend)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// 群组列表
interface GroupListProps {
  items: GroupItem[]
  unreadCounts: Map<string, number>
  selectedPeerId?: string
  onSelect: (group: GroupItem) => void
  groupLastTimeMap?: Record<string, number>  // 群最后消息时间映射
  subtitleMap?: Record<string, string>
  showPinnedStyle?: boolean
}

const GroupList: React.FC<GroupListProps> = ({ items, unreadCounts, selectedPeerId, onSelect, groupLastTimeMap, subtitleMap, showPinnedStyle = false }) => {
  // 按置顶状态和最后消息时间排序
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      // 先按置顶排序
      if (a.isTop && !b.isTop) return -1
      if (!a.isTop && b.isTop) return 1
      
      // 再按最后消息时间排序
      if (groupLastTimeMap) {
        const aTime = groupLastTimeMap[a.groupCode] || 0
        const bTime = groupLastTimeMap[b.groupCode] || 0
        
        if (aTime !== bTime) {
          return bTime - aTime
        }
      }
      
      // 时间相同或没有时间映射时保持原顺序
      return 0
    })
    
    return sorted
  }, [items, groupLastTimeMap])

  if (sortedItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
        暂无群组
      </div>
    )
  }

  return (
    <div className="py-1">
      {sortedItems.map(group => {
        const unreadCount = unreadCounts.get(`2_${group.groupCode}`) || 0
        return (
          <GroupListItem
            key={group.groupCode}
            group={group}
            isSelected={selectedPeerId === group.groupCode}
            onClick={() => onSelect(group)}
            showPinnedStyle={showPinnedStyle}
            unreadCount={unreadCount}
            subtitle={subtitleMap?.[group.groupCode]}
          />
        )
      })}
    </div>
  )
}



// 最近会话列表
interface RecentListProps {
  items: RecentChatItem[]
  unreadCounts: Map<string, number>
  selectedPeerId?: string
  onSelect: (recent: RecentChatItem) => void
  onEnterGroupAssistant: () => void
}

const RecentList: React.FC<RecentListProps> = ({ items, unreadCounts, selectedPeerId, onSelect, onEnterGroupAssistant }) => {
  const { togglePinChat, removeRecentChat, friendCategories, groups } = useWebQQStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: RecentChatItem } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuPosition = useMenuPosition(contextMenu?.x || 0, contextMenu?.y || 0, menuRef)

  // 计算群助手未读数（msgMask === 2 的群的未读消息总数）
  const groupAssistantUnread = useMemo(() => {
    const assistantGroups = groups.filter(g => g.msgMask === 2)
    let totalUnread = 0
    assistantGroups.forEach(group => {
      const unread = unreadCounts.get(`2_${group.groupCode}`) || 0
      totalUnread += unread
    })
    return totalUnread
  }, [groups, unreadCounts])
  
  // 计算群助手群数量
  const groupAssistantCount = useMemo(() => {
    return groups.filter(g => g.msgMask === 2).length
  }, [groups])

  // 最近会话主列表中隐藏“收进群助手”的群
  const visibleRecentItems = useMemo(() => {
    return items.filter(item => {
      if (item.chatType !== 2) {
        return true
      }
      const group = groups.find(g => g.groupCode === item.peerId)
      return group?.msgMask !== 2
    })
  }, [items, groups])

  // 获取显示名称（优先显示备注）
  const getDisplayName = (item: RecentChatItem): string => {
    if (item.chatType === 2) {
      // 群聊：查找群备注
      const group = groups.find(g => g.groupCode === item.peerId)
      if (group?.remarkName && group.remarkName !== group.groupName) {
        return group.remarkName
      }
    } else if (item.chatType === 1 || item.chatType === 100) {
      // 私聊或临时会话：查找好友备注
      for (const category of friendCategories) {
        const friend = category.friends.find(f => f.uin === item.peerId)
        if (friend?.remark && friend.remark !== friend.nickname) {
          return friend.remark
        }
      }
    }
    return item.peerName
  }

  const handleContextMenu = (e: React.MouseEvent, item: RecentChatItem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const handlePin = async () => {
    if (contextMenu) {
      try {
        await togglePinChat(contextMenu.item.chatType, contextMenu.item.peerId)
      } catch (error: any) {
        console.error('置顶失败:', error)
        alert(`置顶失败: ${error.message || '未知错误'}`)
      }
      closeContextMenu()
    }
  }

  const handleDelete = () => {
    if (contextMenu) {
      removeRecentChat(contextMenu.item.chatType, contextMenu.item.peerId)
      closeContextMenu()
    }
  }

  if (visibleRecentItems.length === 0 && groupAssistantCount === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
        暂无最近会话
      </div>
    )
  }

  return (
    <div className="py-1" onClick={closeContextMenu}>
      {/* 群助手入口 */}
      {groupAssistantCount > 0 && (
        <div
          onClick={onEnterGroupAssistant}
          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-theme-item-hover"
        >
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <MessageCircle size={20} className="text-white" />
            </div>
            {groupAssistantUnread > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
                {groupAssistantUnread}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-theme">群助手</span>
            </div>
            <div className="text-xs text-theme-hint truncate mt-0.5">
              {groupAssistantCount} 个群聊
            </div>
          </div>
        </div>
      )}
      
      {visibleRecentItems.map(item => (
        <RecentListItem
          key={`${item.chatType}_${item.peerId}`}
          item={item}
          displayName={getDisplayName(item)}
          unreadCount={unreadCounts.get(`${item.chatType}_${item.peerId}`) || item.unreadCount}
          isSelected={selectedPeerId === item.peerId}
          onClick={() => onSelect(item)}
          onContextMenu={(e) => handleContextMenu(e, item)}
        />
      ))}
      
      {/* 右键菜单 - 使用 Portal 渲染到 body */}
      {contextMenu && createPortal(
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }}
          />
          <div
            ref={menuRef}
            className="fixed z-50 bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: menuPosition.left, top: menuPosition.top, visibility: menuPosition.ready ? 'visible' : 'hidden' }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              onClick={handlePin}
              className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
            >
              <Pin size={14} className="flex-shrink-0" />
              <span className="flex-1">{contextMenu.item.pinned ? '取消置顶' : '置顶'}</span>
            </button>
            
            {/* 只有群聊才显示消息接收方式 - 使用共享的 GroupMsgMaskMenu 组件 */}
            {contextMenu.item.chatType === 2 && (
              <GroupMsgMaskMenu
                groupCode={contextMenu.item.peerId}
                onClose={closeContextMenu}
              />
            )}
            
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-red-500"
            >
              <Trash2 size={14} className="flex-shrink-0" />
              <span className="flex-1">删除</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

// 最近会话列表项
interface RecentListItemProps {
  item: RecentChatItem
  displayName: string
  unreadCount: number
  isSelected: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export const RecentListItem: React.FC<RecentListItemProps> = ({ item, displayName, unreadCount, isSelected, onClick, onContextMenu }) => {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-pink-500/20' 
          : item.pinned 
            ? 'bg-theme-item-hover' 
            : 'hover:bg-theme-item-hover'
      }`}
    >
      <div className="relative flex-shrink-0">
        <img
          src={item.peerAvatar}
          alt={displayName}
          className="w-10 h-10 rounded-full object-cover"
        />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
            {unreadCount}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-theme truncate">{displayName}</span>
          <span className="text-xs text-theme-hint flex-shrink-0 ml-2">
            {formatMessageTime(item.lastTime)}
          </span>
        </div>
        <div className="text-xs text-theme-hint truncate mt-0.5">{item.lastMessage}</div>
      </div>
    </div>
  )
}

// 群助手列表
interface GroupAssistantListProps {
  groups: GroupItem[]
  recentChats: RecentChatItem[]
  groupLastTimeMap: Record<string, number>
  groupLastMessageMap: Record<string, string>
  unreadCounts: Map<string, number>
  selectedPeerId?: string
  onSelect: (group: GroupItem) => void
  onBack: () => void
}

const GroupAssistantList: React.FC<GroupAssistantListProps> = ({ groups, recentChats, groupLastTimeMap, groupLastMessageMap, unreadCounts, selectedPeerId, onSelect, onBack }) => {
  // 过滤出 msgMask === 2 的群（收进群助手不提醒）
  const assistantGroups = useMemo(() => {
    return groups.filter(g => g.msgMask === 2)
  }, [groups])

  const assistantSubtitleMap = useMemo(() => {
    const map: Record<string, string> = { ...groupLastMessageMap }
    recentChats.forEach(chat => {
      if (chat.chatType === 2 && chat.lastMessage) {
        map[chat.peerId] = chat.lastMessage
      }
    })
    return map
  }, [groupLastMessageMap, recentChats])

  return (
    <div className="py-1">
      {/* 返回按钮 */}
      <div
        onClick={onBack}
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-theme-item-hover border-b border-theme-divider"
      >
        <ChevronRight size={16} className="transform rotate-180 text-theme-secondary" />
        <span className="text-sm font-medium text-theme">返回最近会话</span>
      </div>

      {/* 群助手标题 */}
      <div className="px-3 py-2 text-xs text-theme-hint">
        群助手 ({assistantGroups.length})
      </div>

      {/* 群列表 */}
      {assistantGroups.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
          暂无群聊
        </div>
      ) : (
        <GroupList
          items={assistantGroups}
          unreadCounts={unreadCounts}
          groupLastTimeMap={groupLastTimeMap}
          subtitleMap={assistantSubtitleMap}
          selectedPeerId={selectedPeerId}
          onSelect={onSelect}
          showPinnedStyle={true}
        />
      )}
    </div>
  )
}

export default ContactList
