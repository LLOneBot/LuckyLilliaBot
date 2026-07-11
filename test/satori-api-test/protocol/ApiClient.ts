import axios, { AxiosInstance, AxiosError } from 'axios'
import {
  IApiClient,
  AccountConnectionConfig,
  NetworkError,
  TimeoutError,
} from '../../test-framework/src/index.js'

/**
 * Satori API 客户端：HTTP POST `/v1/<method>` JSON 调用，header 携带 token + Satori-User-ID + Satori-Platform。
 *
 * Satori 协议跟 Milky 不一样的地方：
 *   - 路径是 `/v1/<method>`，method 名形如 `message.create` / `guild.list`（带点号）
 *   - 必须在 header 里带 `Satori-User-ID`（自己的 bot 账号 uin）和 `Satori-Platform`（实现 ID）
 *   - 没有 `{status, retcode, data}` 包装层 — 调用成功 server 直接返回业务对象（200 OK）
 *     调用失败 server 返回 4xx/5xx + 文本 error message。
 *
 * 为了让 IApiClient 接口一致（test-framework 期望 call().then(res.status === 'ok')），
 * 我们在客户端层做适配：把成功响应包装成 `{ ok: true, data: <body> }`，把失败响应
 * 包装成 `{ ok: false, status: number, message: string }`，测试代码再判断 ok 字段。
 */
export interface SatoriResponse<T = unknown> {
  ok: boolean
  /** 调用成功时填，satori method 的原始返回 body */
  data?: T
  /** 调用失败时的 HTTP 状态码 */
  status?: number
  /** 调用失败时 server 的错误描述（text body 或 axios message） */
  message?: string
}

export class SatoriApiClient implements IApiClient {
  private httpClient: AxiosInstance

  constructor(private config: AccountConnectionConfig, private retryAttempts: number = 3) {
    this.httpClient = axios.create({
      baseURL: config.host,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        // satori 这俩 header 是协议要求的：
        //   Satori-User-ID 必填，server 端 405-403 校验 selfId
        //   Satori-Platform 必填，标识实现（llonebot / llbot 都接受）
        'Satori-User-ID': config.user_id,
        'Satori-Platform': 'llonebot',
      },
    })
    if (config.apiKey) {
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${config.apiKey}`
    }
  }

  async call<R = unknown>(method: string, params: any = {}): Promise<SatoriResponse<R>> {
    let lastError: Error | undefined
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.httpClient.post(`/v1/${method}`, params)
        return { ok: true, data: response.data as R }
      } catch (error) {
        lastError = error as Error
        if (axios.isAxiosError(error)) {
          const ae = error as AxiosError
          if (ae.code === 'ECONNABORTED' || ae.code === 'ETIMEDOUT') continue
          if (ae.response) {
            const body = ae.response.data
            const message = typeof body === 'string'
              ? body
              : ((body as any)?.message ?? (body as any)?.error ?? JSON.stringify(body))
            return { ok: false, status: ae.response.status, message }
          }
        }
        throw new NetworkError(`Satori ${method} request failed`, error as Error)
      }
    }
    if (lastError && axios.isAxiosError(lastError)) {
      const ae = lastError as AxiosError
      if (ae.code === 'ECONNABORTED' || ae.code === 'ETIMEDOUT') {
        throw new TimeoutError(`Satori ${method} timed out after ${this.retryAttempts} attempts`, 30000)
      }
    }
    throw new NetworkError(`Satori ${method} failed after ${this.retryAttempts} attempts`, lastError)
  }

  disconnect(): void {
    // HTTP 没长连接，no-op
  }

  getConfig(): AccountConnectionConfig {
    return { ...this.config }
  }
}
