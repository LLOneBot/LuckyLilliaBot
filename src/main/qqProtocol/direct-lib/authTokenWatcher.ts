import { unwatchFile, watchFile } from 'node:fs'
import { authTokenUtil } from '../../config'
import { validateAuthToken } from './sign'
import { authTokenStatus, selfInfo } from '@/common/globalVars'
import { getAuthTokenPageUrl } from '@/common/utils/environment'

// data/auth_token.txt 变化时校验, 通过则登录; WebUI 只写文件, 写完调 triggerAuthTokenCheck。
// 用 watchFile 轮询而非 fs.watch: docker bind-mount 下 inotify 常不触发

interface WatcherLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

type OnValid = (token: string) => void | Promise<void>

let started = false
let processing = false
let pending = false
let lastValidToken = ''
// 启动检查和 watchFile 对不存在文件的首次触发会连跑两遍, 只提示一次
let warnedNoToken = false
let retryTimer: NodeJS.Timeout | null = null
let onValidCb: OnValid = () => { }
let log: WatcherLogger = console
const RETRY_MS = 15_000
const POLL_MS = 1_000

export function startAuthTokenWatcher(onValid: OnValid, logger: WatcherLogger): void {
  if (started) return
  started = true
  onValidCb = onValid
  log = logger
  const file = authTokenUtil.getPath()
  void processTokenFile()
  watchFile(file, { interval: POLL_MS }, () => void processTokenFile())
}

/** Undoes startAuthTokenWatcher, so the protocol plugin can be switched off and on again. */
export function stopAuthTokenWatcher(): void {
  if (!started) return
  started = false
  unwatchFile(authTokenUtil.getPath())
  clearRetry()
  onValidCb = () => { }
  // Started again, the same token has to log in again
  lastValidToken = ''
}

export function triggerAuthTokenCheck(): void {
  if (started) void processTokenFile()
}

// 处理中又有变化就置 pending, 处理完再跑一次
async function processTokenFile(): Promise<void> {
  if (!started) return
  if (processing) {
    pending = true
    return
  }
  processing = true
  try {
    do {
      pending = false
      await processOnce()
    } while (pending)
  } finally {
    processing = false
  }
}

async function processOnce(): Promise<void> {
  // AUTH_TOKEN: docker -e AUTH_TOKEN=... 的部署
  const token = authTokenUtil.reload() || (process.env.AUTH_TOKEN || '').trim()
  if (!token) {
    lastValidToken = ''
    authTokenStatus.hasToken = false
    authTokenStatus.validation = 'idle'
    authTokenStatus.message = ''
    if (!warnedNoToken) {
      warnedNoToken = true
      log.warn(
        `[Sign] auth_token 未配置: 请到 ${getAuthTokenPageUrl()} 获取 Auth Token, ` +
        `在 WebUI 中录入或写入 ${authTokenUtil.getPath()} (录入后会自动校验并登录)`
      )
    }
    return
  }

  warnedNoToken = false
  authTokenStatus.hasToken = true
  // watchFile 会抖动, 内容没变就不重复登录
  if (token === lastValidToken && authTokenStatus.validation === 'valid') {
    return
  }

  clearRetry()
  authTokenStatus.validation = 'validating'
  authTokenStatus.message = ''
  const result = await validateAuthToken(token)

  // Stopped while the validation was out
  if (!started) return

  if (result === 'valid') {
    authTokenStatus.validation = 'valid'
    authTokenStatus.message = ''
    authTokenStatus.loginError = ''
    lastValidToken = token
    log.info('[Sign] auth_token 校验通过, 开始登录流程')
    try {
      await onValidCb(token)
    } catch {
      // 多半是网络抖动, 定时重试; 配额上限这类错误只写 loginError 不抛, 不会走到这里
      lastValidToken = ''
      scheduleRetry()
    }
    return
  }

  // 无效 token 交给 native sign 会 process.exit, 进入崩溃循环
  lastValidToken = ''
  if (result === 'invalid') {
    authTokenStatus.validation = 'invalid'
    authTokenStatus.message = 'Auth Token 无效、已失效或无权限，请重新获取'
    log.warn(`[Sign] auth_token 无效/失效/无权限, 请到 ${getAuthTokenPageUrl()} 重新获取`)
  } else {
    // 网络错误无法判定, 先不登录, 定时重试
    authTokenStatus.validation = 'error'
    authTokenStatus.message = '无法连接验证服务器（网络问题），将自动重试'
    if (result instanceof Error) {
      log.warn('[Sign]', result.cause)
    } else {
      log.warn('[Sign] status code', result)
    }
    log.warn('[Sign] auth_token 校验网络失败, 15s 后重试')
    scheduleRetry()
  }
}

function scheduleRetry(): void {
  clearRetry()
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (started && !selfInfo.online) void processTokenFile()
  }, RETRY_MS)
}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}
