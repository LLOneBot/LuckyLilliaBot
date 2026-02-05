import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Pin, Bell, BellOff, Archive, Ban, ChevronRight } from 'lucide-react'
import type { FriendItem, GroupItem } from '../../../types/webqq'
import { useWebQQStore } from '../../../stores/webqqStore'
import { GroupMsgMask, setGroupMsgMask } from '../../../utils/webqqApi'

// 计算菜单位置，确保不超出屏幕
export function useMenuPosition(x: number, y: number, menuRef: React.RefObject<HTMLDivElement>) {
  const [position, setPosition] = useState<{ left: number; top: number; ready: boolean }>({ left: -9999, top: -9999, ready: false })
  
  useEffect(() => {
    setPosition({ left: -9999, top: -9999, ready: false })
    
    const frame = requestAnimationFrame(() => {
      if (!menuRef.current) {
        setPosition({ left: x, top: y, ready: true })
        return
      }
      
      const menuRect = menuRef.current.getBoundingClientRect()
      const padding = 10
      
      let left = x
      let top = y
      
      if (x + menuRect.width > window.innerWidth - padding) {
        left = x - menuRect.width
      }
      if (left < padding) {
        left = padding
      }
      if (y + menuRect.height > window.innerHeight - padding) {
        top = y - menuRect.height
      }
      if (top < padding) {
        top = padding
      }
      
      setPosition({ left, top, ready: true })
    })
    
    return () => cancelAnimationFrame(frame)
  }, [x, y])
  
  return position
}

// 群消息接收方式菜单（共享组件）
interface GroupMsgMaskMenuProps {
  groupCode: string
  onClose: () => void
}

export const GroupMsgMaskMenu: React.FC<GroupMsgMaskMenuProps> = ({ groupCode, onClose }) => {
  const { groups, setGroups } = useWebQQStore()
  const [showSubmenu, setShowSubmenu] = useState(false)
  const submenuRef = useRef<HTMLDivElement>(null)

  const handleSetMsgMask = async (msgMask: GroupMsgMask) => {
    try {
      await setGroupMsgMask(groupCode, msgMask)
      // 更新本地 groups 数据
      const updatedGroups = groups.map(g => 
        g.groupCode === groupCode ? { ...g, msgMask } : g
      )
      setGroups(updatedGroups)
    } catch (error: any) {
      console.error('设置消息接收方式失败:', error)
      alert(`设置失败: ${error.message || '未知错误'}`)
    }
    onClose()
  }

  // 获取当前群的 msgMask
  const currentMsgMask = groups.find(g => g.groupCode === groupCode)?.msgMask

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowSubmenu(true)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
      >
        <Bell size={14} className="flex-shrink-0" />
        <span className="flex-1">消息接收方式</span>
        <ChevronRight size={14} className="flex-shrink-0" />
      </button>
      
      {showSubmenu && (
        <div
          ref={submenuRef}
          className="absolute left-full top-0 ml-1 bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 min-w-[140px] z-[10000]"
          onMouseLeave={() => setShowSubmenu(false)}
        >
          <button
            onClick={() => handleSetMsgMask(GroupMsgMask.AllowNotify)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
          >
            <Bell size={14} className="flex-shrink-0" />
            <span className="flex-1">接收并提醒</span>
            {currentMsgMask === GroupMsgMask.AllowNotify && <span className="flex-shrink-0 text-pink-500">✓</span>}
          </button>
          <button
            onClick={() => handleSetMsgMask(GroupMsgMask.AllowNotNotify)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
          >
            <BellOff size={14} className="flex-shrink-0" />
            <span className="flex-1">接收但不提醒</span>
            {currentMsgMask === GroupMsgMask.AllowNotNotify && <span className="flex-shrink-0 text-pink-500">✓</span>}
          </button>
          <button
            onClick={() => handleSetMsgMask(GroupMsgMask.BoxNotNotify)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
          >
            <Archive size={14} className="flex-shrink-0" />
            <span className="flex-1">收进群助手</span>
            {currentMsgMask === GroupMsgMask.BoxNotNotify && <span className="flex-shrink-0 text-pink-500">✓</span>}
          </button>
          <button
            onClick={() => handleSetMsgMask(GroupMsgMask.NotAllow)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
          >
            <Ban size={14} className="flex-shrink-0" />
            <span className="flex-1">屏蔽群消息</span>
            {currentMsgMask === GroupMsgMask.NotAllow && <span className="flex-shrink-0 text-pink-500">✓</span>}
          </button>
        </div>
      )}
    </div>
  )
}

// 好友列表项
interface FriendListItemProps {
  friend: FriendItem
  isSelected: boolean
  onClick: () => void
}

export const FriendListItem: React.FC<FriendListItemProps> = ({ friend, isSelected, onClick }) => {
  const { togglePinChat } = useWebQQStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuPosition = useMenuPosition(contextMenu?.x || 0, contextMenu?.y || 0, menuRef)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handlePin = async () => {
    try {
      await togglePinChat(1, friend.uin)
    } catch (error: any) {
      console.error('置顶失败:', error)
      alert(`置顶失败: ${error.message || '未知错误'}`)
    }
    closeContextMenu()
  }

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => closeContextMenu()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  return (
    <>
      <div
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
          isSelected ? 'bg-pink-500/20' : 'hover:bg-theme-item-hover'
        }`}
      >
        <div className="relative flex-shrink-0">
          <img
            src={friend.avatar}
            alt={friend.nickname}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.src = `https://q1.qlogo.cn/g?b=qq&nk=${friend.uin}&s=640`
            }}
          />
          {friend.online && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-neutral-800" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-theme truncate">
            {friend.remark || friend.nickname}
          </div>
          {friend.remark && (
            <div className="text-xs text-theme-hint truncate">{friend.nickname}</div>
          )}
        </div>
      </div>

      {contextMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 min-w-[120px] z-[9999]"
          style={{
            left: `${menuPosition.left}px`,
            top: `${menuPosition.top}px`,
            opacity: menuPosition.ready ? 1 : 0,
            pointerEvents: menuPosition.ready ? 'auto' : 'none'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handlePin}
            className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 text-theme"
          >
            <Pin size={14} className="flex-shrink-0" />
            <span className="flex-1">{friend.topTime && friend.topTime !== '0' ? '取消置顶' : '置顶'}</span>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

// 群组列表项
interface GroupListItemProps {
  group: GroupItem
  isSelected: boolean
  onClick: () => void
  showPinnedStyle?: boolean
  unreadCount?: number
}

export const GroupListItem: React.FC<GroupListItemProps> = ({ group, isSelected, onClick, showPinnedStyle = false, unreadCount = 0 }) => {
  const { togglePinChat } = useWebQQStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuPosition = useMenuPosition(contextMenu?.x || 0, contextMenu?.y || 0, menuRef)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const handlePin = async () => {
    try {
      await togglePinChat(2, group.groupCode)
    } catch (error: any) {
      console.error('置顶失败:', error)
      alert(`置顶失败: ${error.message || '未知错误'}`)
    }
    closeContextMenu()
  }

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => closeContextMenu()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  return (
    <>
      <div
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
          isSelected 
            ? 'bg-pink-500/20' 
            : showPinnedStyle && group.isTop 
              ? 'bg-theme-item-hover' 
              : 'hover:bg-theme-item-hover'
        }`}
      >
        <div className="relative flex-shrink-0">
          <img
            src={group.avatar}
            alt={group.groupName}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.src = `https://p.qlogo.cn/gh/${group.groupCode}/${group.groupCode}/640/`
            }}
          />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
              {unreadCount}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-theme truncate">{group.groupName}</div>
          <div className="text-xs text-theme-hint">{group.memberCount} 人</div>
        </div>
      </div>

      {contextMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 min-w-[160px] z-[9999]"
          style={{
            left: `${menuPosition.left}px`,
            top: `${menuPosition.top}px`,
            opacity: menuPosition.ready ? 1 : 0,
            pointerEvents: menuPosition.ready ? 'auto' : 'none'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handlePin}
            className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 text-theme"
          >
            <Pin size={14} className="flex-shrink-0" />
            <span className="flex-1">{group.isTop ? '取消置顶' : '置顶'}</span>
          </button>
          
          {/* 使用共享的消息接收方式菜单 */}
          <GroupMsgMaskMenu groupCode={group.groupCode} onClose={closeContextMenu} />
        </div>,
        document.body
      )}
    </>
  )
}
