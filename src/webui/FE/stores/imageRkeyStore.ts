import { create } from 'zustand'
import { getImageRkey } from '../utils/webqqApi'

// QQ 图片 CDN 的 rkey 是全局两个值（私聊 1406 / 群 1407），会过期。WebQQ 前端持有它们，
// 直接拼在 originImageUrl 后面直连 CDN（配合 <img referrerPolicy="no-referrer">），
// 不再经 BE image-proxy 中转。过期靠 TTL 主动刷 + 图片 onError 兜底刷。
interface ImageRkeyState {
  privateRkey: string
  groupRkey: string
  fetchedAt: number
  loading: boolean
  // 没有 / 过期时才拉，新鲜则 noop（挂在消息组件里高频调用也安全）
  ensureRkey: () => void
  // 强制刷新，带节流；onError 兜底用
  refresh: () => Promise<void>
}

// rkey 实际有效期更长，这里到点主动刷新一次即可
const RKEY_TTL_MS = 10 * 60 * 1000
// onError 兜底刷新的最小间隔，避免坏图狂刷
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
