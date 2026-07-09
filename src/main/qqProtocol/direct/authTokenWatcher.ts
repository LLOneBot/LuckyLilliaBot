import { watchFile } from 'node:fs'
import { authTokenUtil, validateAuthToken } from '../../config'
import { authTokenStatus, selfInfo } from '@/common/globalVars'

// 监听 data/auth_token.txt: 启动时 / 文件变化时读取 -> 校验 -> 通过则触发登录.
// 校验只在这条流程里做 (WebUI 的录入接口只负责写文件, 写完可调 triggerAuthTokenCheck 立即处理).
// 用 watchFile(轮询 stat) 而非 fs.watch(inotify): docker bind-mount 下 inotify 常不触发.

interface WatcherLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

type OnValid = (token: string) => void | Promise<void>

let started = false
let processing = false
let pending = false
// 上次校验通过的 token: 内容没变且已 valid 时不重复触发登录
let lastValidToken = ''
let retryTimer: NodeJS.Timeout | null = null
let onValidCb: OnValid = () => {}
let log: WatcherLogger = console
const RETRY_MS = 15_000
const POLL_MS = 1_000

export function startAuthTokenWatcher(onValid: OnValid, logger: WatcherLogger): void {
  if (started) return
  started = true
  onValidCb = onValid
  log = logger
  const file = authTokenUtil.getPath()
  // 启动即处理一次: 已有有效 token 直接登录; 没有则提示用户去获取
  void processTokenFile()
  watchFile(file, { interval: POLL_MS }, () => void processTokenFile())
}

// WebUI 写入 token 后主动调一次, 不必等 watchFile 轮询 (更快, 也不依赖 poll/inotify 时序)
export function triggerAuthTokenCheck(): void {
  if (started) void processTokenFile()
}

// 并发合并: 处理中又来变化时置 pending, 当前处理完再跑一次 (拿最新内容)
async function processTokenFile(): Promise<void> {
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
  // 文件优先, 回退 AUTH_TOKEN env (兼容 -e AUTH_TOKEN=... 的 docker 部署)
  const token = authTokenUtil.reload() || (process.env.AUTH_TOKEN || '').trim()
  if (!token) {
    lastValidToken = ''
    authTokenStatus.hasToken = false
    authTokenStatus.validation = 'idle'
    authTokenStatus.message = ''
    log.warn(
      '[Sign] auth_token 未配置: 请到 https://auth.luckylillia.com 获取 Auth Token, ' +
      '在 WebUI 中录入或写入 data/auth_token.txt (录入后会自动校验并登录)'
    )
    return
  }

  authTokenStatus.hasToken = true
  // 已验证通过且内容没变 -> 不重复登录 (避免 watchFile 抖动重复触发)
  if (token === lastValidToken && authTokenStatus.validation === 'valid') {
    return
  }

  clearRetry()
  authTokenStatus.validation = 'validating'
  authTokenStatus.message = ''
  const result = await validateAuthToken(token)

  if (result === 'valid') {
    authTokenStatus.validation = 'valid'
    authTokenStatus.message = ''
    authTokenStatus.loginError = '' // 新的有效 token, 清掉上一次的登录错误
    lastValidToken = token
    log.info('[Sign] auth_token 校验通过, 开始登录流程')
    try {
      await onValidCb(token)
    } catch {
      // 登录初始化抛错 (通常是 transient connect/网络): 清 dedup + 定时重试自愈.
      // "配额上限"这类 onValidCb 内部只写 loginError 不抛错, 不会到这里, 也就不会无谓重试.
      lastValidToken = ''
      scheduleRetry()
    }
    return
  }

  // 校验不通过: 绝不进入登录 (无效 token 交给 native sign 会触发 process.exit 崩溃循环)
  lastValidToken = ''
  if (result === 'invalid') {
    authTokenStatus.validation = 'invalid'
    authTokenStatus.message = 'Auth Token 无效、已失效或无权限，请重新获取'
    log.warn('[Sign] auth_token 无效/失效/无权限, 等待重新录入')
  } else {
    // 网络错误: 无法判定, 不冒险登录; 定时重试 (验证服务恢复后自动继续)
    authTokenStatus.validation = 'error'
    authTokenStatus.message = '无法连接验证服务器（网络问题），将自动重试'
    log.warn('[Sign] auth_token 校验网络失败, 15s 后重试')
    scheduleRetry()
  }
}

function scheduleRetry(): void {
  clearRetry()
  retryTimer = setTimeout(() => {
    retryTimer = null
    // 仍未登录成功才重试 (校验网络失败 / 登录初始化失败两种都靠它自愈; processOnce 自带去重)
    if (!selfInfo.online) void processTokenFile()
  }, RETRY_MS)
}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}
