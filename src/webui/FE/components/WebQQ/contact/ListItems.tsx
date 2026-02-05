import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Pin } from 'lucide-react'
import type { FriendItem, GroupItem } from '../../../types/webqq'
import { useWebQQStore } from '../../../stores/webqqStore'

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
            className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 text-theme"
          >
            <Pin className="w-4 h-4" />
            {friend.topTime && friend.topTime !== '0' ? '取消置顶' : '置顶'}
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

  const closeContextMenu = () => setContextMenu(null)

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
            className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 text-theme"
          >
            <Pin className="w-4 h-4" />
            {group.isTop ? '取消置顶' : '置顶'}
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
