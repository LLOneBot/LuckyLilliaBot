import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FriendCategory, GroupItem, RecentChatItem, ChatSession, GroupMemberItem, RawMessage } from '../types/webqq'
import { getFriends, getGroups, getRecentChats } from '../utils/webqqApi'

// 缓存过期时间（1小时）
const CACHE_EXPIRY_MS = 60 * 60 * 1000
// 消息缓存过期时间（24小时）
const MESSAGE_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000
// 群成员缓存过期时间（30分钟）
const MEMBERS_CACHE_EXPIRY_MS = 30 * 60 * 1000
// 每个会话最多缓存消息数
const CACHE_MAX_MESSAGES = 50

interface MessageCacheEntry {
  messages: RawMessage[]
  timestamp: number
}

interface MembersCacheEntry {
  members: GroupMemberItem[]
  timestamp: number
}


type TabType = 'friends' | 'groups' | 'recent'

interface WebQQState {
  // 联系人数据
  friendCategories: FriendCategory[]
  groups: GroupItem[]
  recentChats: RecentChatItem[]
  
  // 加载状态
  contactsLoading: boolean
  contactsError: string | null
  
  // 当前会话
  currentChat: ChatSession | null
  
  // 当前 Tab
  activeTab: TabType
  
  // 未读计数
  unreadCounts: Record<string, number>
  
  // 好友分组展开状态（空数组表示全部折叠）
  expandedCategories: number[]
  
  // 消息缓存
  messageCache: Record<string, MessageCacheEntry>
  
  // 群成员缓存
  membersCache: Record<string, MembersCacheEntry>
  
  // 群成员面板展开状态
  showMemberPanel: boolean
  
  // 缓存时间戳
  contactsCacheTimestamp: number
  
  // Actions
  setFriendCategories: (categories: FriendCategory[]) => void
  setGroups: (groups: GroupItem[]) => void
  setRecentChats: (chats: RecentChatItem[]) => void
  setContactsLoading: (loading: boolean) => void
  setContactsError: (error: string | null) => void
  setCurrentChat: (chat: ChatSession | null) => void
  setActiveTab: (tab: TabType) => void
  
  // 未读计数操作
  setUnreadCount: (chatKey: string, count: number) => void
  incrementUnreadCount: (chatKey: string) => void
  clearUnreadCount: (chatKey: string) => void
  initUnreadCounts: (recentChats: RecentChatItem[]) => void
  
  // 分组展开操作
  toggleCategory: (categoryId: number) => void
  setExpandedCategories: (ids: number[]) => void
  
  // 消息缓存操作
  getCachedMessages: (chatType: string, peerId: string) => RawMessage[] | null
  setCachedMessages: (chatType: string, peerId: string, messages: RawMessage[]) => void
  appendCachedMessage: (chatType: string, peerId: string, message: RawMessage) => void
  
  // 群成员缓存操作
  getCachedMembers: (groupCode: string) => GroupMemberItem[] | null
  setCachedMembers: (groupCode: string, members: GroupMemberItem[]) => void
  
  // 群成员面板操作
  setShowMemberPanel: (show: boolean) => void
  
  // 联系人加载
  loadContacts: () => Promise<void>
  refreshContacts: () => Promise<void>
  
  // 更新最近会话
  updateRecentChat: (chatType: string, peerId: string, lastMessage: string, lastTime: number, peerName?: string, peerAvatar?: string) => void
  
  // 检查缓存是否有效
  isContactsCacheValid: () => boolean
}

export const useWebQQStore = create<WebQQState>()(
  persist(
    (set, get) => ({
      // 初始状态
      friendCategories: [],
      groups: [],
      recentChats: [],
      contactsLoading: false,
      contactsError: null,
      currentChat: null,
      activeTab: 'recent',
      unreadCounts: {},
      expandedCategories: [],
      messageCache: {},
      membersCache: {},
      showMemberPanel: false,
      contactsCacheTimestamp: 0,

      // 基础 setters
      setFriendCategories: (categories) => set({ friendCategories: categories }),
      setGroups: (groups) => set({ groups }),
      setRecentChats: (chats) => set({ recentChats: chats }),
      setContactsLoading: (loading) => set({ contactsLoading: loading }),
      setContactsError: (error) => set({ contactsError: error }),
      setCurrentChat: (chat) => set({ currentChat: chat }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      // 未读计数操作
      setUnreadCount: (chatKey, count) => set((state) => ({
        unreadCounts: { ...state.unreadCounts, [chatKey]: count }
      })),
      
      incrementUnreadCount: (chatKey) => set((state) => ({
        unreadCounts: { 
          ...state.unreadCounts, 
          [chatKey]: (state.unreadCounts[chatKey] || 0) + 1 
        }
      })),
      
      clearUnreadCount: (chatKey) => set((state) => {
        const { [chatKey]: _, ...rest } = state.unreadCounts
        return { unreadCounts: rest }
      }),
      
      initUnreadCounts: (recentChats) => {
        const counts: Record<string, number> = {}
        recentChats.forEach(item => {
          if (item.unreadCount > 0) {
            counts[`${item.chatType}_${item.peerId}`] = item.unreadCount
          }
        })
        set({ unreadCounts: counts })
      },

      // 分组展开操作
      toggleCategory: (categoryId) => set((state) => {
        const expanded = new Set(state.expandedCategories)
        if (expanded.has(categoryId)) {
          expanded.delete(categoryId)
        } else {
          expanded.add(categoryId)
        }
        return { expandedCategories: Array.from(expanded) }
      }),
      
      setExpandedCategories: (ids) => set({ expandedCategories: ids }),

      // 消息缓存操作
      getCachedMessages: (chatType, peerId) => {
        const state = get()
        const key = `${chatType}_${peerId}`
        const entry = state.messageCache[key]
        
        if (entry && Date.now() - entry.timestamp < MESSAGE_CACHE_EXPIRY_MS) {
          return entry.messages
        }
        return null
      },
      
      setCachedMessages: (chatType, peerId, messages) => set((state) => {
        const key = `${chatType}_${peerId}`
        const messagesToCache = messages.slice(-CACHE_MAX_MESSAGES)
        
        // 清理过期缓存
        const now = Date.now()
        const cleanedCache: Record<string, MessageCacheEntry> = {}
        for (const [k, v] of Object.entries(state.messageCache)) {
          if (now - v.timestamp < MESSAGE_CACHE_EXPIRY_MS) {
            cleanedCache[k] = v
          }
        }
        
        return {
          messageCache: {
            ...cleanedCache,
            [key]: { messages: messagesToCache, timestamp: now }
          }
        }
      }),
      
      appendCachedMessage: (chatType, peerId, message) => set((state) => {
        const key = `${chatType}_${peerId}`
        const entry = state.messageCache[key]
        
        if (entry) {
          return {
            messageCache: {
              ...state.messageCache,
              [key]: {
                messages: [...entry.messages.slice(-(CACHE_MAX_MESSAGES - 1)), message],
                timestamp: Date.now()
              }
            }
          }
        }
        return state
      }),

      // 群成员缓存操作
      getCachedMembers: (groupCode) => {
        const state = get()
        const entry = state.membersCache[groupCode]
        
        if (entry && Date.now() - entry.timestamp < MEMBERS_CACHE_EXPIRY_MS) {
          return entry.members
        }
        return null
      },
      
      setCachedMembers: (groupCode, members) => set((state) => {
        // 清理过期缓存
        const now = Date.now()
        const cleanedCache: Record<string, MembersCacheEntry> = {}
        for (const [k, v] of Object.entries(state.membersCache)) {
          if (now - v.timestamp < MEMBERS_CACHE_EXPIRY_MS) {
            cleanedCache[k] = v
          }
        }
        
        return {
          membersCache: {
            ...cleanedCache,
            [groupCode]: { members, timestamp: now }
          }
        }
      }),
      
      // 群成员面板操作
      setShowMemberPanel: (show) => set({ showMemberPanel: show }),

      // 检查缓存是否有效
      isContactsCacheValid: () => {
        const state = get()
        return (
          state.contactsCacheTimestamp > 0 &&
          Date.now() - state.contactsCacheTimestamp < CACHE_EXPIRY_MS &&
          (state.friendCategories.length > 0 || state.groups.length > 0)
        )
      },

      // 加载联系人（优先使用缓存）
      loadContacts: async () => {
        const state = get()
        
        // 如果缓存有效，直接使用缓存数据
        if (state.isContactsCacheValid()) {
          // 后台静默刷新
          state.refreshContacts()
          return
        }
        
        // 缓存无效，显示加载状态
        set({ contactsLoading: true, contactsError: null })
        
        try {
          const [categoriesData, groupsData, recentData] = await Promise.all([
            getFriends(),
            getGroups(),
            getRecentChats()
          ])
          
          // 合并最近会话
          const localRecentMap = new Map<string, RecentChatItem>()
          state.recentChats.forEach(item => {
            localRecentMap.set(`${item.chatType}_${item.peerId}`, item)
          })
          
          recentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            const local = localRecentMap.get(key)
            if (local) {
              if (item.lastTime > local.lastTime) {
                localRecentMap.set(key, item)
              }
            } else {
              localRecentMap.set(key, item)
            }
          })
          
          const mergedRecent = Array.from(localRecentMap.values())
            .sort((a, b) => b.lastTime - a.lastTime)
          
          set({
            friendCategories: categoriesData,
            groups: groupsData,
            recentChats: mergedRecent,
            contactsCacheTimestamp: Date.now(),
            contactsLoading: false
          })
          
          // 初始化未读计数（合并）
          const currentUnread = get().unreadCounts
          const newUnread = { ...currentUnread }
          recentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            if (!(key in newUnread) && item.unreadCount > 0) {
              newUnread[key] = item.unreadCount
            }
          })
          set({ unreadCounts: newUnread })
        } catch (e: any) {
          set({ 
            contactsError: e.message || '加载联系人失败',
            contactsLoading: false 
          })
        }
      },

      // 强制刷新联系人（后台静默）
      refreshContacts: async () => {
        try {
          const [categoriesData, groupsData, recentData] = await Promise.all([
            getFriends(),
            getGroups(),
            getRecentChats()
          ])
          
          // 合并最近会话：保留本地更新的，合并服务器返回的
          const state = get()
          const localRecentMap = new Map<string, RecentChatItem>()
          state.recentChats.forEach(item => {
            localRecentMap.set(`${item.chatType}_${item.peerId}`, item)
          })
          
          // 合并服务器数据
          recentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            const local = localRecentMap.get(key)
            if (local) {
              // 使用较新的时间戳
              if (item.lastTime > local.lastTime) {
                localRecentMap.set(key, item)
              }
            } else {
              localRecentMap.set(key, item)
            }
          })
          
          // 转换为数组并按时间排序
          const mergedRecent = Array.from(localRecentMap.values())
            .sort((a, b) => b.lastTime - a.lastTime)
          
          set({
            friendCategories: categoriesData,
            groups: groupsData,
            recentChats: mergedRecent,
            contactsCacheTimestamp: Date.now()
          })
          
          // 更新未读计数（只添加新的，不覆盖已有的）
          const currentUnread = get().unreadCounts
          const newUnread = { ...currentUnread }
          recentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            if (!(key in newUnread) && item.unreadCount > 0) {
              newUnread[key] = item.unreadCount
            }
          })
          set({ unreadCounts: newUnread })
        } catch (e) {
          // 静默刷新失败不显示错误
          console.error('Failed to refresh contacts:', e)
        }
      },

      // 更新最近会话（如果不存在则创建）
      updateRecentChat: (chatType, peerId, lastMessage, lastTime, peerName?: string, peerAvatar?: string) => set((state) => {
        // 先去重，确保没有重复项
        const dedupedChats = state.recentChats.filter((item, index, arr) => 
          arr.findIndex(i => i.chatType === item.chatType && i.peerId === item.peerId) === index
        )
        
        const existing = dedupedChats.find(
          item => item.chatType === chatType && item.peerId === peerId
        )
        
        const currentChat = state.currentChat
        const isCurrentChat = currentChat?.chatType === chatType && currentChat?.peerId === peerId
        
        if (existing) {
          // 更新已存在的会话
          const updated = dedupedChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )
          
          return {
            recentChats: [{
              ...existing,
              lastMessage,
              lastTime,
              unreadCount: isCurrentChat ? 0 : existing.unreadCount + 1
            }, ...updated]
          }
        } else {
          // 创建新的会话
          // 尝试从好友列表或群组列表获取名称和头像
          let name = peerName || peerId
          let avatar = peerAvatar || ''
          
          if (chatType === 'friend') {
            // 从好友列表查找
            for (const category of state.friendCategories) {
              const friend = category.friends.find(f => f.uin === peerId)
              if (friend) {
                name = friend.remark || friend.nickname
                avatar = friend.avatar
                break
              }
            }
            if (!avatar) {
              avatar = `https://q1.qlogo.cn/g?b=qq&nk=${peerId}&s=640`
            }
          } else if (chatType === 'group') {
            // 从群组列表查找
            const group = state.groups.find(g => g.groupCode === peerId)
            if (group) {
              name = group.groupName
              avatar = group.avatar
            }
            if (!avatar) {
              avatar = `https://p.qlogo.cn/gh/${peerId}/${peerId}/640/`
            }
          }
          
          const newChat: RecentChatItem = {
            chatType: chatType as 'friend' | 'group',
            peerId,
            peerName: name,
            peerAvatar: avatar,
            lastMessage,
            lastTime,
            unreadCount: isCurrentChat ? 0 : 1
          }
          
          return {
            recentChats: [newChat, ...dedupedChats]
          }
        }
      })
    }),
    {
      name: 'webqq-storage',
      partialize: (state) => ({
        // 只持久化这些字段
        friendCategories: state.friendCategories,
        groups: state.groups,
        recentChats: state.recentChats,
        expandedCategories: state.expandedCategories,
        messageCache: state.messageCache,
        membersCache: state.membersCache,
        showMemberPanel: state.showMemberPanel,
        contactsCacheTimestamp: state.contactsCacheTimestamp,
        unreadCounts: state.unreadCounts,
        activeTab: state.activeTab,
        currentChat: state.currentChat
      }),
      // 恢复数据时去重
      onRehydrateStorage: () => (state) => {
        if (state && state.recentChats) {
          // 去重最近会话
          const seen = new Set<string>()
          state.recentChats = state.recentChats.filter(item => {
            const key = `${item.chatType}_${item.peerId}`
            if (seen.has(key)) {
              return false
            }
            seen.add(key)
            return true
          })
        }
      }
    }
  )
)
