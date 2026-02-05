import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FriendCategory, GroupItem, RecentChatItem, ChatSession, GroupMemberItem } from '../types/webqq'
import { getFriends, getGroups, getRecentChats } from '../utils/webqqApi'

// 缓存过期时间（1小时）
const CACHE_EXPIRY_MS = 60 * 60 * 1000
// 群成员缓存过期时间（30分钟）
const MEMBERS_CACHE_EXPIRY_MS = 30 * 60 * 1000

// 全局加载中的 Promise，避免重复请求
const loadingMembersPromises = new Map<string, Promise<GroupMemberItem[]>>()

interface MembersCacheEntry {
  members: GroupMemberItem[]
  timestamp: number
}

// 滚动位置记录（用消息ID定位）
interface ScrollPosition {
  msgId: string  // 可见区域第一条消息的 ID
  offset: number // 该消息距离顶部的偏移量
}

type TabType = 'friends' | 'groups' | 'recent'

// 群助手视图模式
type GroupAssistantMode = 'normal' | 'assistant'

// 已访问的聊天（不持久化，每次进入页面重置）
let visitedChats = new Set<string>()

// 已拉取过成员的群（不持久化，每次进入页面重置）
let fetchedMembersGroups = new Set<string>()

// 重置已访问聊天记录
export const resetVisitedChats = () => {
  visitedChats = new Set<string>()
  fetchedMembersGroups = new Set<string>()
}

// 检查是否已访问过
export const hasVisitedChat = (chatType: number, peerId: string): boolean => {
  return visitedChats.has(`${chatType}_${peerId}`)
}

// 标记为已访问
export const markChatVisited = (chatType: number, peerId: string) => {
  visitedChats.add(`${chatType}_${peerId}`)
}

// 取消已访问标记（用于加载中断时）
export const unmarkChatVisited = (chatType: number, peerId: string) => {
  visitedChats.delete(`${chatType}_${peerId}`)
}

// 检查群成员是否已拉取过
export const hasFetchedMembers = (groupCode: string): boolean => {
  return fetchedMembersGroups.has(groupCode)
}

// 标记群成员已拉取
export const markMembersFetched = (groupCode: string) => {
  fetchedMembersGroups.add(groupCode)
}

interface WebQQState {
  // 联系人数据
  friendCategories: FriendCategory[]
  groups: GroupItem[]
  recentChats: RecentChatItem[]
  
  // 群最后消息时间映射（用于排序）
  groupLastTimeMap: Record<string, number>
  
  // 加载状态
  contactsLoading: boolean
  contactsError: string | null
  
  // 当前会话
  currentChat: ChatSession | null
  
  // 当前 Tab
  activeTab: TabType
  
  // 群助手模式
  groupAssistantMode: GroupAssistantMode
  
  // 未读计数
  unreadCounts: Record<string, number>
  
  // 好友分组展开状态（空数组表示全部折叠）
  expandedCategories: number[]
  
  // 群成员缓存
  membersCache: Record<string, MembersCacheEntry>
  
  // 群成员面板展开状态
  showMemberPanel: boolean
  
  // 滚动位置记录
  scrollPositions: Record<string, ScrollPosition>
  
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
  
  // 群助手模式操作
  setGroupAssistantMode: (mode: GroupAssistantMode) => void
  enterGroupAssistant: () => void
  exitGroupAssistant: () => void
  
  // 未读计数操作
  setUnreadCount: (chatKey: string, count: number) => void
  incrementUnreadCount: (chatKey: string) => void
  clearUnreadCount: (chatKey: string) => void
  initUnreadCounts: (recentChats: RecentChatItem[]) => void
  
  // 分组展开操作
  toggleCategory: (categoryId: number) => void
  setExpandedCategories: (ids: number[]) => void
  
  // 群成员缓存操作
  getCachedMembers: (groupCode: string) => GroupMemberItem[] | null
  setCachedMembers: (groupCode: string, members: GroupMemberItem[]) => void
  fetchGroupMembers: (groupCode: string, forceRefresh?: boolean) => Promise<GroupMemberItem[]>
  
  // 群成员面板操作
  setShowMemberPanel: (show: boolean) => void
  
  // 滚动位置操作
  getScrollPosition: (chatType: string, peerId: string) => ScrollPosition | null
  setScrollPosition: (chatType: string, peerId: string, position: ScrollPosition) => void
  clearScrollPosition: (chatType: string, peerId: string) => void
  
  // 联系人加载
  loadContacts: () => Promise<void>
  refreshContacts: () => Promise<void>
  
  // 更新最近会话
  updateRecentChat: (chatType: number, peerId: string, lastMessage: string, lastTime: number, peerName?: string, peerAvatar?: string) => void
  
  // 置顶/取消置顶会话
  togglePinChat: (chatType: number, peerId: string) => Promise<void>
  
  // 删除最近会话
  removeRecentChat: (chatType: number, peerId: string) => void
  
  // 删除好友（从本地缓存中移除）
  removeFriend: (uid: string) => void
  
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
      groupLastTimeMap: {},
      contactsLoading: false,
      contactsError: null,
      currentChat: null,
      activeTab: 'recent',
      groupAssistantMode: 'normal',
      unreadCounts: {},
      expandedCategories: [],
      membersCache: {},
      showMemberPanel: false,
      scrollPositions: {},
      contactsCacheTimestamp: 0,

      // 基础 setters
      setFriendCategories: (categories) => set({ friendCategories: categories }),
      setGroups: (groups) => set({ groups }),
      setRecentChats: (chats) => set({ recentChats: chats }),
      setContactsLoading: (loading) => set({ contactsLoading: loading }),
      setContactsError: (error) => set({ contactsError: error }),
      setCurrentChat: (chat) => set({ currentChat: chat }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      // 群助手模式操作
      setGroupAssistantMode: (mode) => set({ groupAssistantMode: mode }),
      enterGroupAssistant: () => set({ groupAssistantMode: 'assistant' }),
      exitGroupAssistant: () => set({ groupAssistantMode: 'normal' }),

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
      
      // 统一的获取群成员方法（带缓存和去重）
      // forceRefresh: 是否强制刷新（首次进入聊天框时传 true）
      fetchGroupMembers: async (groupCode, forceRefresh = false) => {
        const state = get()
        
        console.log('[Store] fetchGroupMembers called:', groupCode, 'forceRefresh:', forceRefresh)
        
        // 1. 检查缓存（非强制刷新时使用缓存）
        if (!forceRefresh) {
          const cached = state.getCachedMembers(groupCode)
          if (cached) {
            console.log('[Store] Cache hit, returning cached members')
            return cached
          }
        }
        
        // 2. 检查是否正在加载
        const existingPromise = loadingMembersPromises.get(groupCode)
        if (existingPromise) {
          console.log('[Store] Already loading, returning existing promise')
          return existingPromise
        }
        
        // 3. 发起新请求 - 先创建 promise 并存入 map，防止并发调用
        console.log('[Store] Fetching from API')
        
        const promise = (async () => {
          const { getGroupMembers } = await import('../utils/webqqApi')
          const members = await getGroupMembers(groupCode)
          console.log('[Store] API success, caching members')
          get().setCachedMembers(groupCode, members)
          loadingMembersPromises.delete(groupCode)
          return members
        })().catch(err => {
          console.log('[Store] API error:', err.message)
          loadingMembersPromises.delete(groupCode)
          throw err
        })
        
        // 立即存入 map，防止并发调用
        loadingMembersPromises.set(groupCode, promise)
        return promise
      },
      
      // 群成员面板操作
      setShowMemberPanel: (show) => set({ showMemberPanel: show }),

      // 滚动位置操作
      getScrollPosition: (chatType, peerId) => {
        const state = get()
        const key = `${chatType}_${peerId}`
        return state.scrollPositions[key] || null
      },
      
      setScrollPosition: (chatType, peerId, position) => set((state) => ({
        scrollPositions: {
          ...state.scrollPositions,
          [`${chatType}_${peerId}`]: position
        }
      })),
      
      clearScrollPosition: (chatType, peerId) => set((state) => {
        const { [`${chatType}_${peerId}`]: _, ...rest } = state.scrollPositions
        return { scrollPositions: rest }
      }),

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
          
          // 过滤无效的最近会话
          const validRecentData = recentData.filter(item => 
            item.peerId && item.peerId !== '0' && item.peerId !== ''
          )
          
          // 合并最近会话
          const localRecentMap = new Map<string, RecentChatItem>()
          state.recentChats.forEach(item => {
            if (item.peerId && item.peerId !== '0' && item.peerId !== '') {
              localRecentMap.set(`${item.chatType}_${item.peerId}`, item)
            }
          })
          
          validRecentData.forEach(item => {
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
          validRecentData.forEach(item => {
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
          
          // 过滤无效的最近会话
          const validRecentData = recentData.filter(item => 
            item.peerId && item.peerId !== '0' && item.peerId !== ''
          )
          
          // 合并最近会话：保留本地更新的，合并服务器返回的
          const state = get()
          const localRecentMap = new Map<string, RecentChatItem>()
          state.recentChats.forEach(item => {
            if (item.peerId && item.peerId !== '0' && item.peerId !== '') {
              localRecentMap.set(`${item.chatType}_${item.peerId}`, item)
            }
          })
          
          // 合并服务器数据
          validRecentData.forEach(item => {
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
          validRecentData.forEach(item => {
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
        
        // 创建新的 groupLastTimeMap（如果是群聊）
        const newGroupLastTimeMap = chatType === 2 
          ? { ...state.groupLastTimeMap, [peerId]: lastTime }
          : state.groupLastTimeMap
        
        if (existing) {
          // 更新已存在的会话
          const updated = dedupedChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )
          
          // 如果是置顶的，保持在置顶区域
          const updatedChat = {
            ...existing,
            lastMessage,
            lastTime,
            unreadCount: isCurrentChat ? 0 : existing.unreadCount + 1
          }
          
          if (existing.pinned) {
            // 置顶的放在置顶区域的最前面
            const pinnedChats = updated.filter(item => item.pinned)
            const normalChats = updated.filter(item => !item.pinned)
            return {
              recentChats: [updatedChat, ...pinnedChats, ...normalChats],
              groupLastTimeMap: newGroupLastTimeMap
            }
          }
          
          // 非置顶的放在非置顶区域的最前面
          const pinnedChats = updated.filter(item => item.pinned)
          const normalChats = updated.filter(item => !item.pinned)
          return {
            recentChats: [...pinnedChats, updatedChat, ...normalChats],
            groupLastTimeMap: newGroupLastTimeMap
          }
        } else {
          // 创建新的会话
          // 尝试从好友列表或群组列表获取名称和头像
          let name = peerName || peerId
          let avatar = peerAvatar || ''
          
          if (chatType === 1 || chatType === 100) {
            // 从好友列表查找（私聊和临时会话）
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
          } else if (chatType === 2) {
            // 从群组列表查找
            const group = state.groups.find(g => g.groupCode === peerId)
            if (group) {
              // 如果是群助手的群（msgMask === 2），不添加到最近联系列表，但仍然更新时间映射
              if (group.msgMask === 2) {
                return {
                  groupLastTimeMap: newGroupLastTimeMap
                }
              }
              name = group.groupName
              avatar = group.avatar
            }
            if (!avatar) {
              avatar = `https://p.qlogo.cn/gh/${peerId}/${peerId}/640/`
            }
          }
          
          const newChat: RecentChatItem = {
            chatType: chatType as 1 | 2 | 100,
            peerId,
            peerName: name,
            peerAvatar: avatar,
            lastMessage,
            lastTime,
            unreadCount: isCurrentChat ? 0 : 1
          }
          
          return {
            recentChats: [newChat, ...dedupedChats],
            groupLastTimeMap: newGroupLastTimeMap
          }
        }
      }),

      // 置顶/取消置顶会话
      togglePinChat: async (chatType, peerId) => {
        const state = get()
        const chat = state.recentChats.find(item => item.chatType === chatType && item.peerId === peerId)
        if (!chat) return
        
        const newPinnedState = !chat.pinned
        
        try {
          // 调用 QQ API 设置置顶
          const { setRecentChatTop } = await import('../utils/webqqApi')
          await setRecentChatTop(chatType, peerId, newPinnedState)
          
          // 更新本地状态
          set((state) => {
            const chats = state.recentChats.map(item => {
              if (item.chatType === chatType && item.peerId === peerId) {
                return { ...item, pinned: newPinnedState }
              }
              return item
            })
            // 重新排序：置顶的在前，然后按时间排序
            chats.sort((a, b) => {
              if (a.pinned && !b.pinned) return -1
              if (!a.pinned && b.pinned) return 1
              return b.lastTime - a.lastTime
            })
            return { recentChats: chats }
          })
        } catch (error: any) {
          console.error('设置置顶失败:', error)
          throw error
        }
      },

      // 删除最近会话
      removeRecentChat: (chatType, peerId) => set((state) => {
        return {
          recentChats: state.recentChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )
        }
      }),

      // 删除好友（从本地缓存中移除）
      removeFriend: (uid) => set((state) => {
        const newCategories = state.friendCategories.map(category => ({
          ...category,
          friends: category.friends.filter(f => f.uid !== uid),
          memberCount: category.friends.filter(f => f.uid !== uid).length
        }))
        return { friendCategories: newCategories }
      })
    }),
    {
      name: 'webqq-storage',
      partialize: (state) => ({
        // 只持久化这些字段（不包含消息缓存，太大了）
        friendCategories: state.friendCategories,
        groups: state.groups,
        recentChats: state.recentChats,
        groupLastTimeMap: state.groupLastTimeMap,
        expandedCategories: state.expandedCategories,
        // messageCache 不持久化，太大会超出 localStorage 配额
        membersCache: state.membersCache,
        showMemberPanel: state.showMemberPanel,
        scrollPositions: state.scrollPositions,
        contactsCacheTimestamp: state.contactsCacheTimestamp,
        unreadCounts: state.unreadCounts,
        activeTab: state.activeTab,
        currentChat: state.currentChat
      }),
      // 恢复数据时去重
      onRehydrateStorage: () => (state) => {
        if (state && state.recentChats) {
          // 去重最近会话，并过滤掉无效的 peerId
          const seen = new Set<string>()
          state.recentChats = state.recentChats.filter(item => {
            if (!item.peerId || item.peerId === '0' || item.peerId === '') {
              return false
            }
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
