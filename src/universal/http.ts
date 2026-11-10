import { Context, Service } from 'cordis'
import type {
  Http, HttpConfig, HttpError as HttpErrorApi, HttpFetchInit, HttpFile, HttpRequestConfig, HttpResponse,
} from '@luckylillia/plugin-sdk'

export class HttpError extends Error implements HttpErrorApi {
  readonly name = 'HttpError' as const

  constructor(message: string, readonly code?: string, readonly response?: HttpResponse, options?: { cause?: unknown }) {
    super(message, options)
  }
}

/** Later settings win where they say something; headers add up */
export function mergeConfig(base: HttpConfig, more: HttpConfig = {}): HttpConfig {
  const merged: HttpConfig = { ...base }
  for (const [key, value] of Object.entries(more)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value
  }
  if (base.headers || more.headers) merged.headers = { ...base.headers, ...more.headers }
  return merged
}

function resolve(url: string | URL, baseURL?: string): URL {
  if (url instanceof URL) return url
  return baseURL ? new URL(url, baseURL.endsWith('/') ? baseURL : `${baseURL}/`) : new URL(url)
}

/** Without the query, which may carry a key */
const where = (url: URL) => `${url.origin}${url.pathname}`

function encode(data: unknown, headers: Headers): BodyInit | undefined {
  if (data === undefined || data === null) return
  if (typeof data === 'string' || data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Blob
    || data instanceof FormData || data instanceof URLSearchParams || data instanceof ReadableStream) {
    return data as BodyInit
  }
  headers.set('content-type', 'application/json')
  return JSON.stringify(data)
}

async function decode(response: Response, type?: HttpRequestConfig['responseType']): Promise<unknown> {
  if (type === 'stream') return response.body
  if (type === 'arraybuffer') return response.arrayBuffer()
  if (type === 'text') return response.text()
  if (type === 'json') return response.json()
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('json')) {
    const text = await response.text()
    try {
      return text ? JSON.parse(text) : undefined
    } catch {
      // Error pages often claim JSON: their text still says what went wrong
      return text
    }
  }
  if (/^text\/|xml|javascript|urlencoded/.test(contentType)) return response.text()
  return response.arrayBuffer()
}

export function sniff(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte)
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  if (starts(0x42, 0x4d)) return 'image/bmp'
}

/** undici answers every failure with "fetch failed": the code is down the cause chain */
function transportError(error: unknown, url: URL, callerSignal?: AbortSignal | null): unknown {
  // The caller's own abort is theirs to handle
  if (callerSignal?.aborted) return callerSignal.reason
  if ((error as Error)?.name === 'TimeoutError') return new HttpError(`${url.origin} did not answer in time`, 'ETIMEDOUT', undefined, { cause: error })
  let cause = error as { message?: string; code?: string; cause?: unknown } | undefined
  while (cause?.cause) cause = cause.cause as typeof cause
  const reason = cause?.code ?? cause?.message ?? String(error)
  return new HttpError(`cannot reach ${url.origin}: ${reason}`, cause?.code, undefined, { cause: error })
}

function filenameOf(headers: Headers, url: URL): string | undefined {
  const disposition = headers.get('content-disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded)
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  if (plain) return plain
  const last = url.pathname.split('/').pop()
  return last ? decodeURIComponent(last) : undefined
}

export class HttpClient implements Http {
  constructor(private readonly ctx: Context, readonly config: HttpConfig = {}) {}

  extend(config: HttpConfig): Http {
    return new HttpClient(this.ctx, mergeConfig(this.config, config))
  }

  proxy(input: string | URL, more?: HttpConfig): string {
    const config = mergeConfig(this.config, more)
    const url = resolve(input, config.baseURL)
    const proxy = { url: '' }
    this.ctx.emit('http/proxy', url, proxy, config)
    return proxy.url
  }

  async fetch(input: string | URL, init: RequestInit = {}, more?: HttpConfig): Promise<Response> {
    const config = mergeConfig(this.config, more)
    const url = resolve(input, config.baseURL)
    const headers = new Headers(config.headers)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    const signals = [init.signal, config.timeout ? AbortSignal.timeout(config.timeout) : undefined]
      .filter((signal): signal is AbortSignal => !!signal)
    const request: HttpFetchInit = { ...init, headers, signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0] }
    // Not caught: a proxy that cannot be set up must fail the request, not let it go out directly
    this.ctx.emit('http/fetch-init', url, request, config)
    try {
      return await fetch(url, request as RequestInit)
    } catch (error) {
      throw transportError(error, url, init.signal)
    }
  }

  async request<T = any>(method: string, url: string, config: HttpRequestConfig = {}): Promise<HttpResponse<T>> {
    const { params, data, responseType, signal, redirect, ...rest } = config
    const target = resolve(url, rest.baseURL ?? this.config.baseURL)
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) target.searchParams.append(key, String(value))
    }
    const headers = new Headers()
    const body = encode(data, headers)
    const response = await this.fetch(target, { method, headers, body, signal, redirect }, rest)
    let decoded: unknown
    try {
      decoded = method === 'HEAD' ? undefined : await decode(response, responseType)
    } catch (error) {
      // The timeout also runs while the body comes in
      if ((error as Error)?.name !== 'SyntaxError') throw transportError(error, target, signal)
      // A failed answer is about its status, whatever its body
      if (response.ok) throw new HttpError(`${method} ${where(target)} answered something that is not JSON`, undefined, undefined, { cause: error })
    }
    const result: HttpResponse<T> = { url: response.url, status: response.status, statusText: response.statusText, headers: response.headers, data: decoded as T }
    if (!response.ok) throw new HttpError(`${method} ${where(target)} answered ${response.status}`, undefined, result)
    return result
  }

  async get<T = any>(url: string, config?: HttpRequestConfig): Promise<T> {
    return (await this.request<T>('GET', url, config)).data
  }

  async delete<T = any>(url: string, config?: HttpRequestConfig): Promise<T> {
    return (await this.request<T>('DELETE', url, config)).data
  }

  async head(url: string, config?: HttpRequestConfig): Promise<Headers> {
    return (await this.request('HEAD', url, config)).headers
  }

  async post<T = any>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<T> {
    return (await this.request<T>('POST', url, { ...config, data })).data
  }

  async put<T = any>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<T> {
    return (await this.request<T>('PUT', url, { ...config, data })).data
  }

  async patch<T = any>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<T> {
    return (await this.request<T>('PATCH', url, { ...config, data })).data
  }

  async file(url: string, config: HttpRequestConfig = {}): Promise<HttpFile> {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',')
      const meta = url.slice(5, comma)
      const bytes = Buffer.from(decodeURIComponent(url.slice(comma + 1)), meta.includes(';base64') ? 'base64' : 'utf8')
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      return { data, type: meta.split(';')[0] || sniff(bytes) || 'application/octet-stream' }
    }
    const response = await this.request<ArrayBuffer>('GET', url, { ...config, responseType: 'arraybuffer' })
    const given = response.headers.get('content-type')?.split(';')[0].trim()
    // Some servers (QQ's among them) call every file application/octet-stream: the bytes know better
    const type = given && given !== 'application/octet-stream' ? given : sniff(new Uint8Array(response.data)) ?? given ?? 'application/octet-stream'
    return { data: response.data, type, filename: filenameOf(response.headers, new URL(response.url || url)) }
  }
}

/**
 * `ctx.http`. Plain fetch() is left alone: the bot's own requests (login, QQ media, OneBot reports) never pass
 * `http/fetch-init` and so never take a proxy.
 */
export class HttpService extends Service implements Http {
  private readonly client: HttpClient

  constructor(ctx: Context, config: HttpConfig = {}) {
    super(ctx, 'http')
    this.client = new HttpClient(ctx, config)
  }

  get config() {
    return this.client.config
  }

  extend(config: HttpConfig) {
    return this.client.extend(config)
  }

  proxy(url: string | URL, config?: HttpConfig) {
    return this.client.proxy(url, config)
  }

  fetch(url: string | URL, init?: RequestInit, config?: HttpConfig) {
    return this.client.fetch(url, init, config)
  }

  request<T = any>(method: string, url: string, config?: HttpRequestConfig) {
    return this.client.request<T>(method, url, config)
  }

  get<T = any>(url: string, config?: HttpRequestConfig) {
    return this.client.get<T>(url, config)
  }

  delete<T = any>(url: string, config?: HttpRequestConfig) {
    return this.client.delete<T>(url, config)
  }

  head(url: string, config?: HttpRequestConfig) {
    return this.client.head(url, config)
  }

  post<T = any>(url: string, data?: unknown, config?: HttpRequestConfig) {
    return this.client.post<T>(url, data, config)
  }

  put<T = any>(url: string, data?: unknown, config?: HttpRequestConfig) {
    return this.client.put<T>(url, data, config)
  }

  patch<T = any>(url: string, data?: unknown, config?: HttpRequestConfig) {
    return this.client.patch<T>(url, data, config)
  }

  file(url: string, config?: HttpRequestConfig) {
    return this.client.file(url, config)
  }
}

export default HttpService
