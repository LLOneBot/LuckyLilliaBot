// 按账号隔离的存储 key 都要拼这个前缀, 同一浏览器可能先后登录多个账号。App.tsx 在 selfInfo.online 时写入,
// 之前返回空串, 调用方见到空串就不要持久化

const KEY = 'current-uin'

export function getCurrentUin(): string {
  return localStorage.getItem(KEY) || ''
}

export function setCurrentUin(uin: string): void {
  localStorage.setItem(KEY, uin)
}
