import { Context } from 'cordis'

// All calls moved to api.bot.qq.com on 2026-08-10 (bot.q.qq.com changelog)
const API_BASE = 'https://api.bot.qq.com'
const TOKEN_URL = 'https://api.bot.qq.com/app/getAppAccessToken'

/** Token endpoint codes no retry can fix: wrong AppID or secret, or the bot was removed. */
const CREDENTIAL_ERRORS = new Set([10004, 100007, 100016])

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `err_code` or `code` of the response body */
    readonly code?: number,
    readonly traceId?: string,
  ) {
    super(message)
  }
}

/** The AppID or secret is wrong: retrying is pointless until the settings change. */
export class CredentialError extends Error {}

export interface ApiOptions {
  appId: string
  secret: string
  sandbox: boolean
  /** Replaces https://api.bot.qq.com */
  endpoint?: string
  /** Logs every request and response */
  debug?: boolean
}

export interface RequestOptions {
  /** Query parameters */
  params?: Record<string, unknown>
  /** Sent as multipart instead of JSON */
  form?: FormData
}

/** The API base: a custom endpoint, `sandbox.` put in front of the host for the sandbox. */
export function apiBase(endpoint: string | undefined, sandbox: boolean): string {
  let base = (endpoint?.trim() || API_BASE).replace(/\/+$/, '')
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(base)) base = 'https://' + base
  return sandbox ? base.replace(/^([a-z][a-z\d+.-]*:\/\/)/i, '$1sandbox.') : base
}

export class QQOfficialApi {
  readonly base: string
  private token?: string
  private pending?: Promise<string>
  private disposeRefresh?: () => void
  private logger

  constructor(private ctx: Context, readonly options: ApiOptions) {
    this.base = apiBase(options.endpoint, options.sandbox)
    this.logger = ctx.logger('qq-official')
  }

  accessToken(): Promise<string> {
    if (this.token) return Promise.resolve(this.token)
    return this.pending ??= this.fetchToken().finally(() => {
      this.pending = undefined
    })
  }

  invalidateToken() {
    this.token = undefined
  }

  dispose() {
    this.disposeRefresh?.()
    this.disposeRefresh = undefined
  }

  async request<T = any>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    let url = this.base + path
    const query = Object.entries(options.params ?? {}).filter(([, value]) => value !== undefined && value !== null)
    if (query.length) url += '?' + new URLSearchParams(query.map(([key, value]) => [key, String(value)])).toString()
    if (this.options.debug) this.logger.info('%s %s 请求: %o', method, path, options.form ? '(multipart)' : body)
    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken()
      let res: Response
      try {
        res = await fetch(url, {
          method,
          headers: {
            'Authorization': `QQBot ${token}`,
            'X-Union-Appid': this.options.appId,
            ...(body === undefined || options.form ? {} : { 'Content-Type': 'application/json' }),
          },
          body: options.form ?? (body === undefined ? undefined : JSON.stringify(body)),
          signal: AbortSignal.timeout(60_000),
        })
      } catch (e) {
        const cause = (e as Error & { cause?: Error }).cause
        throw new Error(`${method} ${path} 请求失败: ${cause?.message ?? (e as Error).message}`)
      }
      const text = await res.text()
      const data = parseBody(text)
      // A token refreshed elsewhere can outlive the cached one by a few seconds
      if (res.status === 401 && attempt === 0) {
        this.invalidateToken()
        continue
      }
      const traceId = res.headers.get('x-tps-trace-id') ?? undefined
      if (this.options.debug) this.logger.info('%s %s 响应 %d: %o, trace id: %s', method, path, res.status, data, traceId)
      // A 2xx can still carry a non-zero err_code
      if (!res.ok || numberField(data, 'err_code')) {
        const code = numberField(data, 'err_code') ?? numberField(data, 'code')
        const message = (data && typeof data === 'object' && typeof data.message === 'string') ? data.message : text || res.statusText
        throw new ApiError(`${method} ${path} 失败: [${code ?? res.status}] ${message}`, res.status, code, traceId)
      }
      return data as T
    }
  }

  private async fetchToken(): Promise<string> {
    let res: Response
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: this.options.appId, clientSecret: this.options.secret }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      const cause = (e as Error & { cause?: Error }).cause
      throw new Error(`获取 AccessToken 失败: ${cause?.message ?? (e as Error).message}`)
    }
    // Failures come back as HTTP 200 with a `code`
    const data = parseBody(await res.text()) ?? {}
    const expiresIn = Number(data.expires_in)
    if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(expiresIn)) {
      const code = numberField(data, 'code')
      const message = `获取 AccessToken 失败: [${code ?? res.status}] ${data.message ?? res.statusText}`
      if (code !== undefined && CREDENTIAL_ERRORS.has(code)) throw new CredentialError(message)
      throw new ApiError(message, res.status, code, res.headers.get('x-tps-trace-id') ?? undefined)
    }
    this.token = data.access_token
    // Asked within its last 60 seconds the server issues a new token and keeps the old one working; asked
    // earlier it hands back the same one with the remaining lifetime, which lands the next try inside that window
    this.scheduleRefresh(Math.max(expiresIn - 50, 5) * 1000)
    return data.access_token
  }

  private scheduleRefresh(delay: number) {
    this.disposeRefresh?.()
    this.disposeRefresh = this.ctx.timeout(() => {
      this.fetchToken().catch((e: Error) => {
        this.logger.warn('刷新 AccessToken 失败, 10 秒后重试: %s', e.message)
        this.scheduleRefresh(10_000)
      })
    }, delay)
  }
}

function parseBody(text: string): any {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function numberField(data: unknown, key: string): number | undefined {
  if (!data || typeof data !== 'object') return
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}
