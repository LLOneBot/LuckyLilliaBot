import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { FriendCategory, GroupItem, RecentChatItem, ChatSession, GroupMemberItem, NotificationItem } from '../types/webqq'
import { getFriends, getGroups, getRecentChats, getGroupNotifications, getFriendRequests, getDoubtBuddyRequests, getGroupMembers, getUserAvatar, setRecentChatTop } from '../utils/webqqApi'
import { GroupNotifyType, GroupNotifyStatus } from '../types/webqq'

const STORAGE_NAME = 'webqq-storage'

// 分区键必须显式持有, 不能每次现读 localStorage['current-uin']:
// 那个值在 hydrate 时刻还是上一个账号的 (setCurrentUin 要等 /api/config 返回),
// 会读到旧号数据、再把旧号数据回写进新号的桶. 由 hydrateWebQQStore 赋值.
let activeUin = ''

// uin 未就位前一律空转 -- 宁可不持久化, 也不能读写到别的账号的桶
const accountStorage = createJSONStorage(() => ({
  getItem: (name: string) => (activeUin ? localStorage.getItem(`${activeUin}-${name}`) : null),
  setItem: (name: string, value: string) => {
    if (activeUin) localStorage.setItem(`${activeUin}-${name}`, value)
  },
  removeItem: (name: string) => {
    if (activeUin) localStorage.removeItem(`${activeUin}-${name}`)
  },
}))

const CACHE_EXPIRY_MS = 60 * 60 * 1000
const MEMBERS_CACHE_EXPIRY_MS = 30 * 60 * 1000

// 进行中的请求, 并发调用共用一个
const loadingMembersPromises = new Map<string, Promise<GroupMemberItem[]>>()

interface MembersCacheEntry {
  members: GroupMemberItem[]
  timestamp: number
}

// 按消息 ID 定位
interface ScrollPosition {
  msgId: string  // 可见区域第一条消息的 ID
  offset: number // 该消息距离顶部的偏移量
}

type TabType = 'friends' | 'groups' | 'recent'

type GroupAssistantMode = 'normal' | 'assistant'

// 这两个不持久化, 每次进入页面重置
let visitedChats = new Set<string>()

let fetchedMembersGroups = new Set<string>()

export const resetVisitedChats = () => {
  visitedChats = new Set<string>()
  fetchedMembersGroups = new Set<string>()
}

export const hasVisitedChat = (chatType: number, peerId: string): boolean => {
  return visitedChats.has(`${chatType}_${peerId}`)
}

export const markChatVisited = (chatType: number, peerId: string) => {
  visitedChats.add(`${chatType}_${peerId}`)
}

// 加载中断时用
export const unmarkChatVisited = (chatType: number, peerId: string) => {
  visitedChats.delete(`${chatType}_${peerId}`)
}

export const hasFetchedMembers = (groupCode: string): boolean => {
  return fetchedMembersGroups.has(groupCode)
}

export const markMembersFetched = (groupCode: string) => {
  fetchedMembersGroups.add(groupCode)
}

interface WebQQState {
  friendCategories: FriendCategory[]
  groups: GroupItem[]
  recentChats: RecentChatItem[]

  // 用于排序
  groupLastTimeMap: Record<string, number>
  // 群助手预览用
  groupLastMessageMap: Record<string, string>

  contactsLoading: boolean
  contactsError: string | null
  currentChat: ChatSession | null
  activeTab: TabType
  groupAssistantMode: GroupAssistantMode
  unreadCounts: Record<string, number>
  // 空数组 = 全部折叠
  expandedCategories: number[]
  membersCache: Record<string, MembersCacheEntry>
  showMemberPanel: boolean
  notifications: NotificationItem[]
  notificationUnreadCount: number
  scrollPositions: Record<string, ScrollPosition>
  contactsCacheTimestamp: number

  // Actions
  setFriendCategories: (categories: FriendCategory[]) => void
  setGroups: (groups: GroupItem[]) => void
  setRecentChats: (chats: RecentChatItem[]) => void
  setContactsLoading: (loading: boolean) => void
  setContactsError: (error: string | null) => void
  setCurrentChat: (chat: ChatSession | null) => void
  setActiveTab: (tab: TabType) => void

  setGroupAssistantMode: (mode: GroupAssistantMode) => void
  enterGroupAssistant: () => void
  exitGroupAssistant: () => void

  setUnreadCount: (chatKey: string, count: number) => void
  incrementUnreadCount: (chatKey: string) => void
  clearUnreadCount: (chatKey: string) => void
  initUnreadCounts: (recentChats: RecentChatItem[]) => void

  toggleCategory: (categoryId: number) => void
  setExpandedCategories: (ids: number[]) => void

  getCachedMembers: (groupCode: string) => GroupMemberItem[] | null
  setCachedMembers: (groupCode: string, members: GroupMemberItem[]) => void
  fetchGroupMembers: (groupCode: string, forceRefresh?: boolean) => Promise<GroupMemberItem[]>

  setShowMemberPanel: (show: boolean) => void

  addNotification: (notification: NotificationItem) => void
  setNotifications: (notifications: NotificationItem[]) => void
  clearNotificationUnread: () => void
  updateNotificationStatus: (type: string, flag: string, newStatus: number) => void
  loadGroupNotifications: () => Promise<void>

  getScrollPosition: (chatType: string, peerId: string) => ScrollPosition | null
  setScrollPosition: (chatType: string, peerId: string, position: ScrollPosition) => void
  clearScrollPosition: (chatType: string, peerId: string) => void

  loadContacts: () => Promise<void>
  refreshContacts: () => Promise<void>

  updateRecentChat: (chatType: number, peerId: string, lastMessage: string, lastTime: number, peerName?: string, peerAvatar?: string) => void
  togglePinChat: (chatType: number, peerId: string) => Promise<void>
  removeRecentChat: (chatType: number, peerId: string) => void
  // 只从本地缓存移除
  removeFriend: (uid: string) => void
  isContactsCacheValid: () => boolean
}

// partialize 会持久化的字段及其初始值. 同时用于 store 初始状态和 merge,
// 保证两边不会各自漂移 -- merge 靠它抹掉上一个账号残留在内存里的数据.
const INITIAL_PERSISTED = {
  friendCategories: [] as FriendCategory[],
  groups: [] as GroupItem[],
  recentChats: [] as RecentChatItem[],
  groupLastTimeMap: {} as Record<string, number>,
  groupLastMessageMap: {} as Record<string, string>,
  expandedCategories: [] as number[],
  membersCache: {} as Record<string, MembersCacheEntry>,
  showMemberPanel: false,
  scrollPositions: {} as Record<string, ScrollPosition>,
  contactsCacheTimestamp: 0,
  unreadCounts: {} as Record<string, number>,
  activeTab: 'recent' as TabType,
  currentChat: null as ChatSession | null,
}

export const useWebQQStore = create<WebQQState>()(
  persist(
    (set, get) => ({
      ...INITIAL_PERSISTED,
      contactsLoading: false,
      contactsError: null,
      groupAssistantMode: 'normal',
      notifications: [],
      notificationUnreadCount: 0,

      setFriendCategories: (categories) => set({ friendCategories: categories }),
      setGroups: (groups) => set({ groups }),
      setRecentChats: (chats) => set({ recentChats: chats }),
      setContactsLoading: (loading) => set({ contactsLoading: loading }),
      setContactsError: (error) => set({ contactsError: error }),
      setCurrentChat: (chat) => set({ currentChat: chat }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      setGroupAssistantMode: (mode) => set({ groupAssistantMode: mode }),
      enterGroupAssistant: () => set({ groupAssistantMode: 'assistant' }),
      exitGroupAssistant: () => set({ groupAssistantMode: 'normal' }),

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

      getCachedMembers: (groupCode) => {
        const state = get()
        const entry = state.membersCache[groupCode]

        if (entry && Date.now() - entry.timestamp < MEMBERS_CACHE_EXPIRY_MS) {
          return entry.members
        }
        return null
      },

      setCachedMembers: (groupCode, members) => set((state) => {
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

      // forceRefresh: 首次进入聊天时传 true
      fetchGroupMembers: async (groupCode, forceRefresh = false) => {
        const state = get()

        console.log('[Store] fetchGroupMembers called:', groupCode, 'forceRefresh:', forceRefresh)

        if (!forceRefresh) {
          const cached = state.getCachedMembers(groupCode)
          if (cached) {
            console.log('[Store] Cache hit, returning cached members')
            return cached
          }
        }

        const existingPromise = loadingMembersPromises.get(groupCode)
        if (existingPromise) {
          console.log('[Store] Already loading, returning existing promise')
          return existingPromise
        }

        console.log('[Store] Fetching from API')

        const promise = (async () => {
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

        // 同步存入, 并发调用才能拿到同一个
        loadingMembersPromises.set(groupCode, promise)
        return promise
      },

      setShowMemberPanel: (show) => set({ showMemberPanel: show }),

      addNotification: (notification) => set((state) => {
        // group-notify / friend-request 按 flag 去重
        const isDuplicate = state.notifications.some(n => {
          if (n.type === 'group-notify' && notification.type === 'group-notify') {
            return n.data.flag === notification.data.flag
          }
          if (n.type === 'friend-request' && notification.type === 'friend-request') {
            return n.data.flag === notification.data.flag
          }
          return false
        })
        if (isDuplicate) {
          // 状态可能变了
          return {
            notifications: state.notifications.map(n => {
              if (n.type === notification.type) {
                if (n.type === 'group-notify' && notification.type === 'group-notify' && n.data.flag === notification.data.flag) {
                  return notification
                }
                if (n.type === 'friend-request' && notification.type === 'friend-request' && n.data.flag === notification.data.flag) {
                  return notification
                }
              }
              return n
            })
          }
        }
        return {
          notifications: [notification, ...state.notifications].slice(0, 200),
          notificationUnreadCount: state.notificationUnreadCount + 1
        }
      }),

      setNotifications: (notifications) => set({ notifications }),

      clearNotificationUnread: () => set({ notificationUnreadCount: 0 }),

      updateNotificationStatus: (type, flag, newStatus) => set((state) => ({
        notifications: state.notifications.map(n => {
          if (n.type === type) {
            if (n.type === 'group-notify' && n.data.flag === flag) {
              return { ...n, data: { ...n.data, status: newStatus } }
            }
            if (n.type === 'friend-request' && n.data.flag === flag) {
              return { ...n, data: { ...n.data, isDecide: true } }
            }
          }
          return n
        })
      })),

      loadGroupNotifications: async () => {
        try {
          const [notifies, friendReqs, doubtReqs] = await Promise.all([
            getGroupNotifications().catch(() => []),
            getFriendRequests().catch(() => []),
            getDoubtBuddyRequests().catch(() => [])
          ])
          const groupItems: NotificationItem[] = notifies.map(n => ({
            type: 'group-notify' as const,
            data: n,
            time: n.actionTime ? parseInt(n.actionTime) * 1000 : parseInt(n.seq) / 1000
          }))
          const friendItems: NotificationItem[] = friendReqs.map(r => ({
            type: 'friend-request' as const,
            data: r,
            time: r.reqTime ? parseInt(r.reqTime) * 1000 : Date.now()
          }))
          const doubtItems: NotificationItem[] = doubtReqs.map(d => ({
            type: 'doubt-buddy' as const,
            data: d,
            time: d.reqTime ? parseInt(d.reqTime) * 1000 : Date.now()
          }))
          // 保留群解散、退群这类只读通知, 其余用新数据替换
          const state = get()
          const infoNotifications = state.notifications.filter(
            n => n.type !== 'group-notify' && n.type !== 'friend-request' && n.type !== 'doubt-buddy'
          )
          const merged = [...groupItems, ...friendItems, ...doubtItems, ...infoNotifications]
            .sort((a, b) => b.time - a.time)
            .slice(0, 200)
          set({ notifications: merged })
        } catch (e) {
          console.error('加载通知失败:', e)
        }
      },

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

      isContactsCacheValid: () => {
        const state = get()
        return (
          state.contactsCacheTimestamp > 0 &&
          Date.now() - state.contactsCacheTimestamp < CACHE_EXPIRY_MS &&
          (state.friendCategories.length > 0 || state.groups.length > 0)
        )
      },

      loadContacts: async () => {
        const state = get()

        if (state.isContactsCacheValid()) {
          // 后台静默刷新
          state.refreshContacts()
          return
        }

        set({ contactsLoading: true, contactsError: null })

        try {
          const [categoriesData, groupsData, recentData] = await Promise.all([
            getFriends(),
            getGroups(),
            getRecentChats()
          ])

          const validRecentData = recentData.filter(item =>
            item.peerId && item.peerId !== '0' && item.peerId !== ''
          )

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
              const shouldUseRemote =
                item.lastTime > local.lastTime ||
                (item.lastTime === local.lastTime && !local.lastMessage && !!item.lastMessage)
              if (shouldUseRemote) {
                localRecentMap.set(key, item)
              }
            } else {
              localRecentMap.set(key, item)
            }
          })

          const mergedRecent = Array.from(localRecentMap.values())
            .sort((a, b) => b.lastTime - a.lastTime)

          const groupLastTimeMap: Record<string, number> = {}
          const groupLastMessageMap: Record<string, string> = {}
          validRecentData.forEach(item => {
            if (item.chatType === 2) {
              groupLastTimeMap[item.peerId] = item.lastTime
              if (item.lastMessage) {
                groupLastMessageMap[item.peerId] = item.lastMessage
              }
            }
          })

          set({
            friendCategories: categoriesData,
            groups: groupsData,
            recentChats: mergedRecent,
            groupLastTimeMap,
            groupLastMessageMap,
            contactsCacheTimestamp: Date.now(),
            contactsLoading: false
          })

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
          set({
            contactsError: e.message || '加载联系人失败',
            contactsLoading: false
          })
        }
      },

      refreshContacts: async () => {
        try {
          const [categoriesData, groupsData, recentData] = await Promise.all([
            getFriends(),
            getGroups(),
            getRecentChats()
          ])

          const validRecentData = recentData.filter(item =>
            item.peerId && item.peerId !== '0' && item.peerId !== ''
          )

          const state = get()
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
              // 使用较新的时间戳；时间相同但本地摘要为空时也使用服务端摘要
              const shouldUseRemote =
                item.lastTime > local.lastTime ||
                (item.lastTime === local.lastTime && !local.lastMessage && !!item.lastMessage)
              if (shouldUseRemote) {
                localRecentMap.set(key, item)
              }
            } else {
              localRecentMap.set(key, item)
            }
          })

          const mergedRecent = Array.from(localRecentMap.values())
            .sort((a, b) => b.lastTime - a.lastTime)

          const groupLastTimeMap: Record<string, number> = { ...state.groupLastTimeMap }
          const groupLastMessageMap: Record<string, string> = { ...state.groupLastMessageMap }
          validRecentData.forEach(item => {
            if (item.chatType === 2) {
              groupLastTimeMap[item.peerId] = item.lastTime
              if (item.lastMessage) {
                groupLastMessageMap[item.peerId] = item.lastMessage
              }
            }
          })

          set({
            friendCategories: categoriesData,
            groups: groupsData,
            recentChats: mergedRecent,
            groupLastTimeMap,
            groupLastMessageMap,
            contactsCacheTimestamp: Date.now()
          })

          // 只加新的, 不覆盖已有的
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

      updateRecentChat: (chatType, peerId, lastMessage, lastTime, peerName?: string, peerAvatar?: string) => set((state) => {
        const dedupedChats = state.recentChats.filter((item, index, arr) =>
          arr.findIndex(i => i.chatType === item.chatType && i.peerId === item.peerId) === index
        )

        const existing = dedupedChats.find(
          item => item.chatType === chatType && item.peerId === peerId
        )

        const currentChat = state.currentChat
        const isCurrentChat = currentChat?.chatType === chatType && currentChat?.peerId === peerId

        const newGroupLastTimeMap = chatType === 2
          ? { ...state.groupLastTimeMap, [peerId]: lastTime }
          : state.groupLastTimeMap
        const newGroupLastMessageMap = chatType === 2
          ? { ...state.groupLastMessageMap, [peerId]: lastMessage || '[消息]' }
          : state.groupLastMessageMap

        if (existing) {
          const updated = dedupedChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )

          const updatedChat = {
            ...existing,
            lastMessage,
            lastTime,
            unreadCount: isCurrentChat ? 0 : existing.unreadCount + 1
          }

          if (existing.pinned) {
            const pinnedChats = updated.filter(item => item.pinned)
            const normalChats = updated.filter(item => !item.pinned)
            return {
              recentChats: [updatedChat, ...pinnedChats, ...normalChats],
              groupLastTimeMap: newGroupLastTimeMap,
              groupLastMessageMap: newGroupLastMessageMap
            }
          }

          const pinnedChats = updated.filter(item => item.pinned)
          const normalChats = updated.filter(item => !item.pinned)
          return {
            recentChats: [...pinnedChats, updatedChat, ...normalChats],
            groupLastTimeMap: newGroupLastTimeMap,
            groupLastMessageMap: newGroupLastMessageMap
          }
        } else {
          let name = peerName || peerId
          let avatar = peerAvatar || ''

          if (chatType === 1 || chatType === 100) {
            for (const category of state.friendCategories) {
              const friend = category.friends.find(f => f.uin === peerId)
              if (friend) {
                name = friend.remark || friend.nickname
                avatar = friend.avatar
                break
              }
            }
            if (!avatar) {
              avatar = getUserAvatar(peerId)
            }
          } else if (chatType === 2) {
            const group = state.groups.find(g => g.groupCode === peerId)
            if (group) {
              // 群助手里的群不进最近联系人, 但要更新时间
              if (group.msgMask === 2) {
                return {
                  groupLastTimeMap: newGroupLastTimeMap,
                  groupLastMessageMap: newGroupLastMessageMap
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
            groupLastTimeMap: newGroupLastTimeMap,
            groupLastMessageMap: newGroupLastMessageMap
          }
        }
      }),

      togglePinChat: async (chatType, peerId) => {
        const state = get()
        const chat = state.recentChats.find(item => item.chatType === chatType && item.peerId === peerId)
        if (!chat) return

        const newPinnedState = !chat.pinned

        try {
          await setRecentChatTop(chatType, peerId, newPinnedState)

          set((state) => {
            const chats = state.recentChats.map(item => {
              if (item.chatType === chatType && item.peerId === peerId) {
                return { ...item, pinned: newPinnedState }
              }
              return item
            })
            chats.sort((a, b) => {
              if (a.pinned && !b.pinned) return -1
              if (!a.pinned && b.pinned) return 1
              return b.lastTime - a.lastTime
            })
            return { recentChats: chats }
          })
        } catch (error) {
          console.error('设置置顶失败:', error)
          throw error
        }
      },

      removeRecentChat: (chatType, peerId) => set((state) => {
        return {
          recentChats: state.recentChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )
        }
      }),

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
      name: STORAGE_NAME,
      storage: accountStorage,
      // 不在 import 时 hydrate: 那时 uin 还是上一个账号的. 由 hydrateWebQQStore 显式触发
      skipHydration: true,
      partialize: (state) => ({
        // 数据属主. 用来识别历史遗留的跨账号污染 (旧版本写入的 payload 没有这个字段)
        _uin: activeUin,
        friendCategories: state.friendCategories,
        groups: state.groups,
        recentChats: state.recentChats,
        groupLastTimeMap: state.groupLastTimeMap,
        groupLastMessageMap: state.groupLastMessageMap,
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
      // persisted 为空时也要把上一个账号残留在内存里的字段抹掉:
      // 默认 merge 是 {...current, ...persisted}, 新号没有存档时旧号数据会活下来
      merge: (persisted, current) => {
        const { _uin, ...rest } = (persisted ?? {}) as Record<string, unknown>
        return { ...current, ...INITIAL_PERSISTED, ...rest } as WebQQState
      },
      onRehydrateStorage: () => (state) => {
        if (state && state.recentChats) {
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

/** 拿到 uin 后调用 (store 是 skipHydration 的)。没有 _uin 标记的旧 payload 可能是别的账号回写进来的, 一律丢弃 */
export function hydrateWebQQStore(uin: string): void {
  if (!uin || uin === activeUin) return
  activeUin = uin

  const key = `${uin}-${STORAGE_NAME}`
  try {
    const raw = localStorage.getItem(key)
    if (raw && JSON.parse(raw)?.state?._uin !== uin) {
      localStorage.removeItem(key)
    }
  } catch {
    localStorage.removeItem(key)
  }

  void useWebQQStore.persist.rehydrate()
}
