import axios, { AxiosInstance, AxiosError } from 'axios'
import {
  IApiClient,
  AccountConnectionConfig,
  NetworkError,
  TimeoutError,
} from '../../test-framework/src/index.js'

export interface MilkyResponse<T = unknown> {
  status: 'ok' | 'failed'
  retcode: number
  data?: T
  message?: string
}

/**
 * Milky API 客户端：HTTP POST `/api/<endpoint>` JSON 调用。
 * 不支持 WS 调用模式（Milky 设计上 WS 只推事件不接受请求）。
 */
export class MilkyApiClient implements IApiClient {
  private httpClient: AxiosInstance

  constructor(private config: AccountConnectionConfig, private retryAttempts: number = 3) {
    this.httpClient = axios.create({
      baseURL: config.host,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    })
    if (config.apiKey) {
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${config.apiKey}`
    }
  }

  async call<R = unknown>(endpoint: string, params: any = {}): Promise<MilkyResponse<R>> {
    let lastError: Error | undefined
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.httpClient.post(`/api/${endpoint}`, params)
        return response.data as MilkyResponse<R>
      } catch (error) {
        lastError = error as Error
        if (axios.isAxiosError(error)) {
          const ae = error as AxiosError
          if (ae.code === 'ECONNABORTED' || ae.code === 'ETIMEDOUT') continue
          if (ae.response) {
            // server 已回 4xx/5xx 但带 body：直接返回，让测试看 retcode/message
            if (ae.response.data) return ae.response.data as MilkyResponse<R>
            throw new NetworkError(`Milky ${endpoint} HTTP ${ae.response.status}`, error as Error)
          }
        }
        throw new NetworkError(`Milky ${endpoint} request failed`, error as Error)
      }
    }
    if (lastError && axios.isAxiosError(lastError)) {
      const ae = lastError as AxiosError
      if (ae.code === 'ECONNABORTED' || ae.code === 'ETIMEDOUT') {
        throw new TimeoutError(`Milky ${endpoint} timed out after ${this.retryAttempts} attempts`, 30000)
      }
    }
    throw new NetworkError(`Milky ${endpoint} failed after ${this.retryAttempts} attempts`, lastError)
  }

  disconnect(): void {
    // HTTP 没长连接，no-op
  }

  getConfig(): AccountConnectionConfig {
    return { ...this.config }
  }
}
