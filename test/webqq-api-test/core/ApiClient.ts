import crypto from 'node:crypto'

export interface TestConfig {
  /** 例如 http://127.0.0.1:3080, 不带尾斜线 */
  host: string
  /** 明文, client 算 sha256 当 X-Webui-Token 发; 不填就读 password_file */
  password?: string
  /** 相对 test.config.json 所在目录, 比如 "../../data/webui_token.txt" */
  password_file?: string
  user_id: string
  test_group_id: string
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
 * 请求形状同 src/webui/FE/utils/api.ts: 带 X-Webui-Token: sha256(password), 后端回
 * { success, data?, message?, error? }, 失败一律 throw。REST 风格, 不实现 framework 的 IApiClient
 */
export class WebQQApiClient {
  private hashedToken: string
  private host: string

  constructor(private config: TestConfig, password: string) {
    this.host = config.host.replace(/\/$/, '')
    this.hashedToken = crypto.createHash('sha256').update(password).digest('hex')
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

  /** 拿到 uin 才算在线且鉴权通过; 配了 user_id 而登录的不是它就 throw */
  async healthCheck(): Promise<{ uid: string; uin: string; nick?: string }> {
    const data = await this.get<{ uid: string; uin: string; nick?: string }>('/api/login-info')
    if (!data.uin) {
      throw new Error('healthCheck: bot 未登录 (login-info.uin 空)')
    }
    if (this.config.user_id && data.uin !== this.config.user_id) {
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
