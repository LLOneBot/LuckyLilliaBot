import axios, { AxiosInstance, AxiosError } from 'axios'
import {
  IApiClient,
  AccountConnectionConfig,
  NetworkError,
  TimeoutError,
} from '../../test-framework/src/index.js'

/**
 * Satori 的响应没有 `{status, retcode, data}` 包装: 成功直接回业务对象, 失败回 4xx/5xx + 文本。
 * 这里统一包成 `{ ok: true, data }` / `{ ok: false, status, message }`
 */
export interface SatoriResponse<T = unknown> {
  ok: boolean
  data?: T
  status?: number
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
        // 协议要求的两个 header: server 用 Satori-User-ID 校验 selfId, Satori-Platform 填 llonebot / llbot 都行
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
