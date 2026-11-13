import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/plugin/internal/tool/webqq/client/utils/webqqApi', () => ({
  getFriends: vi.fn(async () => []),
  getGroups: vi.fn(async () => []),
  getRecentChats: vi.fn(async () => []),
  getGroupNotifications: vi.fn(async () => []),
  getFriendRequests: vi.fn(async () => []),
  getDoubtBuddyRequests: vi.fn(async () => []),
  getGroupMembers: vi.fn(async () => []),
  setRecentChatTop: vi.fn(async () => {}),
}))

import { useWebQQStore, hydrateWebQQStore, hasVisitedChat, markChatVisited, hasFetchedMembers, markMembersFetched } from '@/plugin/internal/tool/webqq/client/stores/webqqStore'
import { getFriends, getGroups, getRecentChats, getGroupMembers, getFriendRequests, setRecentChatTop } from '@/plugin/internal/tool/webqq/client/utils/webqqApi'

const store = new Map<string, string>()
const g = globalThis as unknown as { localStorage: Storage }
g.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
} as Storage

const chat = (peerId: string) => ({
  chatType: 2 as const, peerId, peerName: `g${peerId}`, peerAvatar: '',
  lastMessage: 'hi', lastTime: 1, unreadCount: 0,
})

// 写一份指定账号的存档
const seed = (uin: string, payload: object) =>
  store.set(`${uin}-webqq-storage`, JSON.stringify({ state: payload, version: 0 }))

const readBucket = (uin: string) => JSON.parse(store.get(`${uin}-webqq-storage`)!).state

// activeUin 是模块级的, 用一个不会被任何用例使用的哨兵账号把它顶开,
// 这样每个用例里的 hydrateWebQQStore 都会真正执行 (而不是被"同 uin"短路),
// 同时 merge 会把上个用例残留的状态抹掉
const resetStore = () => {
  vi.clearAllMocks()
  store.clear()
  hydrateWebQQStore('__sentinel__')
  store.clear()
}

// 必须跑在任何 hydrate 之前: activeUin 一旦绑定就回不到未绑定态
describe('webqqStore 未绑定账号', () => {
  it('uin 就位前的 set() 不落盘', () => {
    useWebQQStore.setState({ recentChats: [chat('111')] })
    expect(store.size).toBe(0)
  })
})

describe('webqqStore 账号隔离', () => {
  beforeEach(resetStore)

  it('只读当前账号的桶, 不碰别的账号', () => {
    seed('A', { _uin: 'A', recentChats: [chat('aaa')] })
    seed('B', { _uin: 'B', recentChats: [chat('bbb')] })

    hydrateWebQQStore('B')

    expect(useWebQQStore.getState().recentChats.map(c => c.peerId)).toEqual(['bbb'])
  })

  it('丢弃旧版本遗留的无 _uin 存档 (跨账号污染源)', () => {
    // 旧版本在 uin 就位前 hydrate, 把 A 的数据回写进了 B 的桶, 且没有 _uin 标记
    seed('B', { recentChats: [chat('aaa')], contactsCacheTimestamp: Date.now() })

    hydrateWebQQStore('B')

    expect(useWebQQStore.getState().recentChats).toEqual([])
    expect(useWebQQStore.getState().contactsCacheTimestamp).toBe(0)
    expect(store.has('B-webqq-storage')).toBe(false)
  })

  it('_uin 与当前账号对不上的存档也丢弃', () => {
    seed('B', { _uin: 'A', recentChats: [chat('aaa')] })

    hydrateWebQQStore('B')

    expect(useWebQQStore.getState().recentChats).toEqual([])
    expect(store.has('B-webqq-storage')).toBe(false)
  })

  it('切号时抹掉上一个账号残留在内存里的数据', () => {
    seed('A', { _uin: 'A', recentChats: [chat('aaa')] })
    hydrateWebQQStore('A')
    expect(useWebQQStore.getState().recentChats).toHaveLength(1)

    // B 没有任何存档: 默认 merge 会让 A 的内存数据活下来, 必须被 INITIAL_PERSISTED 抹掉
    hydrateWebQQStore('B')

    expect(useWebQQStore.getState().recentChats).toEqual([])
  })

  it('切号后的写入落到新账号的桶, 不污染旧账号', () => {
    seed('A', { _uin: 'A', recentChats: [chat('aaa')] })
    hydrateWebQQStore('A')
    hydrateWebQQStore('B')

    useWebQQStore.setState({ recentChats: [chat('bbb')] })

    expect(readBucket('B')._uin).toBe('B')
    expect(readBucket('B').recentChats.map((c: { peerId: string }) => c.peerId)).toEqual(['bbb'])
    // A 的存档必须原样保留
    expect(readBucket('A').recentChats.map((c: { peerId: string }) => c.peerId)).toEqual(['aaa'])
  })

  it('重复绑定同一账号不清空已有状态', () => {
    seed('A', { _uin: 'A', recentChats: [chat('aaa')] })
    hydrateWebQQStore('A')
    useWebQQStore.setState({ recentChats: [chat('aaa'), chat('ccc')] })

    hydrateWebQQStore('A')

    expect(useWebQQStore.getState().recentChats).toHaveLength(2)
  })

  it('切号时重置上一个账号的加载状态、通知和访问标记', () => {
    hydrateWebQQStore('A')
    useWebQQStore.setState({
      contactsLoading: true, contactsError: 'A failed', groupAssistantMode: 'assistant',
      notifications: [{ type: 'group-quit', data: { groupCode: '1', groupName: 'A' }, time: 1 }],
      notificationUnreadCount: 1,
    })
    markChatVisited(2, '1')
    markMembersFetched('1')

    hydrateWebQQStore('B')

    expect(useWebQQStore.getState()).toMatchObject({
      contactsLoading: false, contactsError: null, groupAssistantMode: 'normal',
      notifications: [], notificationUnreadCount: 0,
    })
    expect(hasVisitedChat(2, '1')).toBe(false)
    expect(hasFetchedMembers('1')).toBe(false)
  })
})

describe('webqqStore 进行中请求的账号隔离', () => {
  beforeEach(resetStore)

  const category = (name: string) => ({ categoryId: 1, categoryName: name, categorySort: 0, onlineCount: 0, memberCount: 0, friends: [] })
  const group = (name: string) => ({ groupCode: name, groupName: name, avatar: '', memberCount: 0, isTop: false })
  const member = (uin: string) => ({ uid: `u_${uin}`, uin, nickname: uin, card: '', avatar: '', role: 'member' as const })

  it.each(['loadContacts', 'refreshContacts'] as const)('%s 丢弃旧账号的延迟结果，不污染当前账号及其存档', async action => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof getFriends>>>()
    vi.mocked(getFriends).mockReturnValueOnce(pending.promise)
    vi.mocked(getGroups).mockResolvedValueOnce([group('A')])
    vi.mocked(getRecentChats).mockResolvedValueOnce([{ ...chat('A'), unreadCount: 3 }])
    hydrateWebQQStore('A')
    const loading = useWebQQStore.getState()[action]()

    hydrateWebQQStore('B')
    useWebQQStore.setState({ friendCategories: [category('B')], groups: [group('B')], recentChats: [chat('B')], contactsCacheTimestamp: 123 })
    const before = readBucket('B')
    pending.resolve([category('A')])
    await loading

    expect(useWebQQStore.getState().friendCategories).toEqual([category('B')])
    expect(useWebQQStore.getState().groups).toEqual([group('B')])
    expect(useWebQQStore.getState().recentChats).toEqual([chat('B')])
    expect(useWebQQStore.getState().unreadCounts).toEqual({})
    expect(readBucket('B')).toEqual(before)
  })

  it('旧账号请求失败不能清除新账号正在加载的标记或写入错误', async () => {
    const first = Promise.withResolvers<Awaited<ReturnType<typeof getFriends>>>()
    const second = Promise.withResolvers<Awaited<ReturnType<typeof getFriends>>>()
    vi.mocked(getFriends).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    hydrateWebQQStore('A')
    const oldLoading = useWebQQStore.getState().loadContacts()
    hydrateWebQQStore('B')
    const currentLoading = useWebQQStore.getState().loadContacts()

    first.reject(new Error('old account failed'))
    await oldLoading
    expect(useWebQQStore.getState()).toMatchObject({ contactsLoading: true, contactsError: null })
    second.resolve([category('B')])
    await currentLoading
    expect(useWebQQStore.getState()).toMatchObject({ contactsLoading: false, contactsError: null, friendCategories: [category('B')] })
  })

  it('A 切到 B 再切回 A 也不会接收第一次 A 的请求', async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof getFriends>>>()
    vi.mocked(getFriends).mockReturnValueOnce(pending.promise)
    hydrateWebQQStore('A')
    const refreshing = useWebQQStore.getState().refreshContacts()
    hydrateWebQQStore('B')
    hydrateWebQQStore('A')
    pending.resolve([category('old A')])
    await refreshing
    expect(useWebQQStore.getState().friendCategories).toEqual([])
  })

  it('重复确认同一账号保留缓存、成员请求复用和正在加载的有效结果', async () => {
    const contacts = Promise.withResolvers<Awaited<ReturnType<typeof getFriends>>>()
    const members = Promise.withResolvers<Awaited<ReturnType<typeof getGroupMembers>>>()
    vi.mocked(getFriends).mockReturnValueOnce(contacts.promise)
    vi.mocked(getGroupMembers).mockReturnValueOnce(members.promise)
    hydrateWebQQStore('A')
    useWebQQStore.getState().setRecentChats([chat('cached')])
    const loading = useWebQQStore.getState().loadContacts()
    const firstMembers = useWebQQStore.getState().fetchGroupMembers('shared')
    markChatVisited(2, 'shared')
    hydrateWebQQStore('A')
    const sameMembers = useWebQQStore.getState().fetchGroupMembers('shared')
    expect(getGroupMembers).toHaveBeenCalledTimes(1)
    expect(useWebQQStore.getState().contactsLoading).toBe(true)
    expect(hasVisitedChat(2, 'shared')).toBe(true)
    contacts.resolve([category('A')])
    members.resolve([member('A')])
    await loading
    expect(await firstMembers).toEqual([member('A')])
    expect(await sameMembers).toEqual([member('A')])
    expect(useWebQQStore.getState().friendCategories).toEqual([category('A')])
    expect(useWebQQStore.getState().recentChats).toEqual([chat('cached')])
    expect(useWebQQStore.getState().getCachedMembers('shared')).toEqual([member('A')])
  })

  it.each(['success', 'failure'])('旧成员请求 %s 不污染缓存或清除新账号同群的进行中请求', async outcome => {
    const oldResult = Promise.withResolvers<Awaited<ReturnType<typeof getGroupMembers>>>()
    const newResult = Promise.withResolvers<Awaited<ReturnType<typeof getGroupMembers>>>()
    vi.mocked(getGroupMembers).mockReturnValueOnce(oldResult.promise).mockReturnValueOnce(newResult.promise)
    hydrateWebQQStore('A')
    const oldLoading = useWebQQStore.getState().fetchGroupMembers('shared')
    hydrateWebQQStore('B')
    const newLoading = useWebQQStore.getState().fetchGroupMembers('shared')
    if (outcome === 'success') oldResult.resolve([member('A')])
    else oldResult.reject(new Error('old account failed'))
    expect(await oldLoading).toEqual([])
    expect(useWebQQStore.getState().getCachedMembers('shared')).toBeNull()
    const sharedLoading = useWebQQStore.getState().fetchGroupMembers('shared')
    expect(getGroupMembers).toHaveBeenCalledTimes(2)
    newResult.resolve([member('B')])
    expect(await newLoading).toEqual([member('B')])
    expect(await sharedLoading).toEqual([member('B')])
    expect(useWebQQStore.getState().getCachedMembers('shared')).toEqual([member('B')])
  })

  it('旧账号延迟返回的通知不能替换新账号通知', async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof getFriendRequests>>>()
    vi.mocked(getFriendRequests).mockReturnValueOnce(pending.promise)
    hydrateWebQQStore('A')
    const loading = useWebQQStore.getState().loadGroupNotifications()
    hydrateWebQQStore('B')
    const notification = { type: 'group-quit' as const, data: { groupCode: 'B', groupName: 'B' }, time: 1 }
    useWebQQStore.getState().addNotification(notification)
    pending.resolve([{ friendUid: 'u_A', friendUin: 'A', friendNick: 'A', reqTime: '1', extWords: '', isDecide: false, reqType: 1, addSource: '', flag: 'A' }])
    await loading
    expect(useWebQQStore.getState().notifications).toEqual([notification])
    expect(useWebQQStore.getState().notificationUnreadCount).toBe(1)
  })

  it.each(['success', 'failure'])('旧账号的置顶请求 %s 不改变新账号同一会话的状态', async outcome => {
    const pending = Promise.withResolvers<void>()
    vi.mocked(setRecentChatTop).mockReturnValueOnce(pending.promise)
    hydrateWebQQStore('A')
    useWebQQStore.getState().setRecentChats([chat('shared')])
    const changing = useWebQQStore.getState().togglePinChat(2, 'shared')
    hydrateWebQQStore('B')
    useWebQQStore.getState().setRecentChats([chat('shared')])
    const before = readBucket('B')
    if (outcome === 'success') pending.resolve()
    else pending.reject(new Error('old account failed'))
    await expect(changing).resolves.toBeUndefined()
    expect(useWebQQStore.getState().recentChats[0].pinned).toBeUndefined()
    expect(readBucket('B')).toEqual(before)
  })
})
