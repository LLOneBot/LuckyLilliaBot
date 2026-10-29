import { create } from 'zustand'
import { getImageRkey } from '../utils/webqqApi'

// 图片 CDN 的 rkey 全局只有两个 (私聊 1406 / 群 1407), 会过期: 按 TTL 主动刷, 图片 onError 时兜底刷
interface ImageRkeyState {
  privateRkey: string
  groupRkey: string
  fetchedAt: number
  loading: boolean
  // 没有或过期才拉, 高频调用也没事
  ensureRkey: () => void
  // 带节流, 给 onError 用
  refresh: () => Promise<void>
}

// rkey 实际有效期更长，这里到点主动刷新一次即可
const RKEY_TTL_MS = 10 * 60 * 1000
// 免得坏图狂刷
const REFRESH_THROTTLE_MS = 30 * 1000

export const useImageRkeyStore = create<ImageRkeyState>((set, get) => ({
  privateRkey: '',
  groupRkey: '',
  fetchedAt: 0,
  loading: false,
  ensureRkey: () => {
    const { fetchedAt, loading } = get()
    if (loading) return
    if (fetchedAt && Date.now() - fetchedAt < RKEY_TTL_MS) return
    void get().refresh()
  },
  refresh: async () => {
    const { loading, fetchedAt } = get()
    if (loading) return
    if (fetchedAt && Date.now() - fetchedAt < REFRESH_THROTTLE_MS) return
    set({ loading: true })
    try {
      const rkey = await getImageRkey()
      set({
        privateRkey: rkey.private_rkey || '',
        groupRkey: rkey.group_rkey || '',
        fetchedAt: Date.now(),
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },
}))
