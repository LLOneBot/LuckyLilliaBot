import crypto from 'node:crypto'

export interface TestConfig {
  /** WebUI HTTP base, 例如 http://127.0.0.1:3080。不要带尾斜线。 */
  host: string
  /** WebUI 登录密码（明文）。client 算 sha256 当 X-Webui-Token 发。 */
  password: string
  /** bot 自己的 QQ 号，用于断言 GET /login-info 的 selfInfo。 */
  user_id: string
  /** 用于查询型测试的群号 (GET /group-detail / /members 等)。 */
  test_group_id: string
  /** 用于查询型测试的用户 QQ 号 (GET /user / /uid 等)。 */
  test_user_id: string
  timeout?: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export class WebQQApiError extends Error {
  constructor(
    public path: string,
    public status: number,
    public payload: ApiResponse<unknown>,
  ) {
    super(`${path} → ${status}: ${payload.message ?? payload.error ?? 'unknown error'}`)
    this.name = 'WebQQApiError'
  }
}

/**
 * WebUI HTTP client - 复刻 src/webui/FE/utils/api.ts 的请求形状：
 *   - 每个请求带 `X-Webui-Token: sha256(password)` header
 *   - BE 统一返 { success, data?, message?, error? }，failure 一律 throw
 *
 * 不实现 framework 的 IApiClient 接口（OB11 的 action+params 概念这边对不上）；
 * 直接暴露 RESTish helpers (get/post/postJson)。
 */
export class WebQQApiClient {
  private hashedToken: string
  private host: string

  constructor(private config: TestConfig) {
    this.host = config.host.replace(/\/$/, '')
    this.hashedToken = crypto.createHash('sha256').update(config.password).digest('hex')
  }

  async get<R = unknown>(path: string, query: Record<string, string | number> = {}): Promise<R> {
    const url = new URL(this.host + path)
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v))
    }
    const res = await fetch(url, {
      headers: { 'X-Webui-Token': this.hashedToken },
    })
    return this.handle<R>(path, res)
  }

  async post<R = unknown>(path: string, body?: unknown): Promise<R> {
    const res = await fetch(this.host + path, {
      method: 'POST',
      headers: {
        'X-Webui-Token': this.hashedToken,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return this.handle<R>(path, res)
  }

  /** 健康检查：能拿到 selfInfo + uin 匹配 config.user_id 才算 bot 在线 + 鉴权过 */
  async healthCheck(): Promise<{ uid: string; uin: string; nick?: string }> {
    const data = await this.get<{ uid: string; uin: string; nick?: string }>('/api/login-info')
    if (!data.uin) {
      throw new Error('healthCheck: bot 未登录 (login-info.uin 空)')
    }
    if (data.uin !== this.config.user_id) {
      throw new Error(`healthCheck: bot 当前登录 uin=${data.uin}，但 config.user_id=${this.config.user_id}`)
    }
    return data
  }

  private async handle<R>(path: string, res: Response): Promise<R> {
    let payload: ApiResponse<R>
    try {
      payload = await res.json() as ApiResponse<R>
    } catch {
      throw new WebQQApiError(path, res.status, { success: false, message: `non-JSON response (${res.status})` })
    }
    if (!payload.success) {
      throw new WebQQApiError(path, res.status, payload as ApiResponse<unknown>)
    }
    return payload.data as R
  }
}
