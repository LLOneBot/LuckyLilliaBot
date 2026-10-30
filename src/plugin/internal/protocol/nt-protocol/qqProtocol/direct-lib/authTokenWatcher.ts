import { unwatchFile, watchFile } from 'node:fs'
import { authTokenUtil } from '../../../../../../main/config'
import { validateAuthToken } from './sign'
import { getAuthTokenPageUrl } from '@/common/utils/environment'

// data/auth_token.txt 变化时校验, 通过则登录; WebUI 只写文件, 写完经协议的 checkAuthToken() 调 check()。
// 用 watchFile 轮询而非 fs.watch: docker bind-mount 下 inotify 常不触发

/** 协议实例的一份 (base.ts), 由 AuthTokenWatcher 维护, 经 /api/auth-token/status 给前端 */
export interface AuthTokenStatus {
  hasToken: boolean
  validation: 'idle' | 'validating' | 'valid' | 'invalid' | 'error'
  // validation 为 invalid/error 时的说明
  message: string
  // 登录/sign 阶段的错误 (如 auth_token 可用 QQ 数量已达上限); '' 表示无
  loginError: string
}

interface WatcherLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

type OnValid = (token: string) => void | Promise<void>

const RETRY_MS = 15_000
const POLL_MS = 1_000

/** One per protocol instance (direct.ts): a protocol switched on again starts with a new one. */
export class AuthTokenWatcher {
  private file = ''
  private started = false
  private processing = false
  private pending = false
  private lastValidToken = ''
  // 启动检查和 watchFile 对不存在文件的首次触发会连跑两遍, 只提示一次
  private warnedNoToken = false
  private retryTimer: NodeJS.Timeout | null = null
  // Its own listener: unwatchFile without one would take every listener off the file
  private readonly onFileChange = () => void this.process()

  constructor(
    private readonly status: AuthTokenStatus,
    private readonly onValid: OnValid,
    private readonly log: WatcherLogger,
    private readonly isOnline: () => boolean,
    private readonly readToken: () => string = () => authTokenUtil.reload() || (process.env.AUTH_TOKEN || '').trim(),
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.file = authTokenUtil.getPath()
    void this.process()
    watchFile(this.file, { interval: POLL_MS }, this.onFileChange)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    unwatchFile(this.file, this.onFileChange)
    this.clearRetry()
  }

  check(): void {
    if (this.started) void this.process()
  }

  // 处理中又有变化就置 pending, 处理完再跑一次
  private async process(): Promise<void> {
    if (!this.started) return
    if (this.processing) {
      this.pending = true
      return
    }
    this.processing = true
    try {
      do {
        this.pending = false
        await this.processOnce()
      } while (this.pending)
    } finally {
      this.processing = false
    }
  }

  private async processOnce(): Promise<void> {
    const status = this.status
    // AUTH_TOKEN: docker -e AUTH_TOKEN=... 的部署
    const token = this.readToken()
    if (!token) {
      this.lastValidToken = ''
      status.hasToken = false
      status.validation = 'idle'
      status.message = ''
      if (!this.warnedNoToken) {
        this.warnedNoToken = true
        this.log.warn(
          `[Sign] auth_token 未配置: 请到 ${getAuthTokenPageUrl()} 获取 Auth Token, ` +
          `在 WebUI 中录入或写入 ${authTokenUtil.getPath()} (录入后会自动校验并登录)`
        )
      }
      return
    }

    this.warnedNoToken = false
    status.hasToken = true
    // watchFile 会抖动, 内容没变就不重复登录
    if (token === this.lastValidToken && status.validation === 'valid') {
      return
    }

    this.clearRetry()
    status.validation = 'validating'
    status.message = ''
    const result = await validateAuthToken(token)

    // Stopped while the validation was out
    if (!this.started) return

    if (result === 'valid') {
      status.validation = 'valid'
      status.message = ''
      status.loginError = ''
      this.lastValidToken = token
      this.log.info('[Sign] auth_token 校验通过, 开始登录流程')
      try {
        await this.onValid(token)
      } catch {
        // 多半是网络抖动, 定时重试; 配额上限这类错误只写 loginError 不抛, 不会走到这里
        this.lastValidToken = ''
        this.scheduleRetry()
      }
      return
    }

    // 无效 token 交给 native sign 会 process.exit, 进入崩溃循环
    this.lastValidToken = ''
    if (result === 'invalid') {
      status.validation = 'invalid'
      status.message = 'Auth Token 无效、已失效或无权限，请重新获取'
      this.log.warn(`[Sign] auth_token 无效/失效/无权限, 请到 ${getAuthTokenPageUrl()} 重新获取`)
    } else {
      // 网络错误无法判定, 先不登录, 定时重试
      status.validation = 'error'
      status.message = '无法连接验证服务器（网络问题），将自动重试'
      if (result instanceof Error) {
        this.log.warn('[Sign]', result.cause)
      } else {
        this.log.warn('[Sign] status code', result)
      }
      this.log.warn('[Sign] auth_token 校验网络失败, 15s 后重试')
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    this.clearRetry()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.started && !this.isOnline()) void this.process()
    }, RETRY_MS)
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }
}
