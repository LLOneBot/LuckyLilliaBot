export interface HttpConfig {
  /** What relative URLs are resolved against */
  baseURL?: string
  headers?: Record<string, string>
  /** Milliseconds */
  timeout?: number
  /**
   * The proxy for these requests: an http, https or socks5 address, or `''` to go direct. Left out, the address set
   * in the builtin entry「代理」counts. Only that entry routes requests through proxies: with it switched off, none do.
   */
  proxyAgent?: string
}

export interface HttpRequestConfig extends HttpConfig {
  /** Added to the query */
  params?: Record<string, string | number | boolean | undefined>
  /** The body: a plain object or array goes as JSON, anything fetch() takes as it is */
  data?: unknown
  /** How to read the body; by its Content-Type when left out (JSON, text, else bytes) */
  responseType?: 'json' | 'text' | 'arraybuffer' | 'stream'
  signal?: AbortSignal
  redirect?: RequestRedirect
}

export interface HttpResponse<T = any> {
  url: string
  status: number
  statusText: string
  headers: Headers
  data: T
}

/** What `ctx.http` throws: no connection (`code` such as ECONNREFUSED or ETIMEDOUT), or an answer that was not 2xx */
export interface HttpError extends Error {
  name: 'HttpError'
  code?: string
  response?: HttpResponse
}

export interface HttpFile {
  data: ArrayBuffer
  /** The Content-Type, or what the bytes are when the server says nothing useful */
  type: string
  filename?: string
}

/**
 * `ctx.http`: how plugins reach the outside. Every request passes `http/fetch-init`, where the builtin entry「代理」
 * puts its proxy in; plain fetch() calls never get one. Plugins with HTTP settings of their own (a proxy, a base
 * URL) make a client of them with `extend()`.
 */
export interface Http {
  readonly config: HttpConfig
  /**
   * Resolves the effective proxy for a native client without sending a request. Returns `''` for direct access.
   * Uses the same merged settings and builtin proxy rules as fetch(). The returned address may contain
   * authentication credentials: keep it private and resolve again when starting a new native connection.
   */
  proxy(url: string | URL, config?: HttpConfig): string
  get<T = any>(url: string, config?: HttpRequestConfig): Promise<T>
  delete<T = any>(url: string, config?: HttpRequestConfig): Promise<T>
  head(url: string, config?: HttpRequestConfig): Promise<Headers>
  post<T = any>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<T>
  put<T = any>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<T>
  patch<T = any>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<T>
  /** The whole answer; throws HttpError for one that is not 2xx */
  request<T = any>(method: string, url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>
  /** fetch() through the same settings and hooks, the answer as it is, whatever its status */
  fetch(url: string | URL, init?: RequestInit, config?: HttpConfig): Promise<Response>
  /** Downloads a file: http(s) and data: URLs */
  file(url: string, config?: HttpRequestConfig): Promise<HttpFile>
  /** A client with these settings over this one's; headers merge */
  extend(config: HttpConfig): Http
}

/** What `http/fetch-init` lets a listener change: Node's fetch also takes undici's `dispatcher` */
export interface HttpFetchInit extends RequestInit {
  dispatcher?: unknown
}

/** Mutable result of resolving a native client's proxy. An empty URL means direct access. */
export interface HttpProxyResolution {
  url: string
}

declare module 'cordis' {
  interface Context {
    http: Http
  }

  interface Events {
    /** @mode emit. Synchronously resolve the effective proxy; initialized to direct access, with no request sent. */
    'http/proxy'(url: URL, proxy: HttpProxyResolution, config: HttpConfig): void
    /** @mode emit. Before each request of `ctx.http`, with the settings it goes by; a listener may change `init` */
    'http/fetch-init'(url: URL, init: HttpFetchInit, config: HttpConfig): void
  }
}
