import { createHash } from 'node:crypto'

// qimei: q16 进登录 T545, q36 进 SSO reserve f12。真取号 (腾讯 /ola/android 在线注册) 还没接, 先按 guid 合成占位值:
// 扫码不需要 qimei, 但 wtlogin.login 用占位值大概率被风控拒, 真取号是 watch 端到端登录的前提
export interface WatchQimei {
  q16: string
  q36: string
}

let _cache: WatchQimei | null = null

export function getWatchQimei(guid: Buffer): WatchQimei {
  if (_cache) return _cache
  const h = (salt: string) => createHash('sha256').update(guid).update(salt).digest('hex')
  _cache = {
    q16: h('qimei16').slice(0, 16),
    q36: h('qimei36').slice(0, 36),
  }
  return _cache
}
