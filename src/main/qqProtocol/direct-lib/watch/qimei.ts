import { createHash } from 'node:crypto'

// qimei (q16/q36): watch 设备风控标识。
// q16 -> 登录 T545; q36 -> SSO reserve field 12 (设备风险 gate)。
//
// ★现状: 真正的 qimei 取号要打腾讯 /ola/android snowflake 在线注册 (参考
// LuckyLillia.Sign/src/Windows/qimei/ + watch/poc watch_qimei_profile), 尚未接入。
// 这里先按 guid 确定性合成占位值, 保证登录包结构完整可发。
// 影响面: trans_emp 拉码/轮询**不需要** qimei (POC 实证省 field12 仍拉得到码), 所以扫码这步不受影响;
// wtlogin.login 的 T545/reserve-f12 用占位值, 真机风控大概率拒 -> 真取号是 watch 端到端登录的前置。
export interface WatchQimei {
  q16: string
  q36: string
}

let _cache: WatchQimei | null = null

/** 由 device guid 确定性派生占位 qimei (同一设备稳定)。真取号接入后替换本函数。 */
export function getWatchQimei(guid: Buffer): WatchQimei {
  if (_cache) return _cache
  const h = (salt: string) => createHash('sha256').update(guid).update(salt).digest('hex')
  _cache = {
    q16: h('qimei16').slice(0, 16),
    q36: h('qimei36').slice(0, 36),
  }
  return _cache
}
