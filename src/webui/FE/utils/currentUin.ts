// 当前登录账号 uin: WebUI 单实例可登录多个账号 (后端切换 / 浏览器同源多 tab),
// 凡是按账号隔离的存储 key 都要拼这个前缀.
//
// 写入位置: App.tsx 检查到 selfInfo.online 时 setItem.
// 在写入前 (即未登录时) 返回空串, caller 应自己判断空 -> 不持久化.

const KEY = 'current-uin'

export function getCurrentUin(): string {
  return localStorage.getItem(KEY) || ''
}

export function setCurrentUin(uin: string): void {
  localStorage.setItem(KEY, uin)
}
