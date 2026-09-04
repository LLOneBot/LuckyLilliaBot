import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/webui/FE/utils/webqqApi', () => ({
  getFriends: vi.fn(async () => []),
  getGroups: vi.fn(async () => []),
  getRecentChats: vi.fn(async () => []),
  getGroupNotifications: vi.fn(async () => []),
  getFriendRequests: vi.fn(async () => []),
  getDoubtBuddyRequests: vi.fn(async () => []),
  getGroupMembers: vi.fn(async () => []),
  setRecentChatTop: vi.fn(async () => {}),
}))

import { useWebQQStore, hydrateWebQQStore } from '@/webui/FE/stores/webqqStore'

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
  chatType: 2, peerId, peerName: `g${peerId}`, peerAvatar: '',
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
})
