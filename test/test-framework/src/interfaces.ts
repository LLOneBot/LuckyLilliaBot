/**
 * 协议无关的接口定义。三套协议（OB11/Milky/Satori）各自实现这些接口后，
 * 就能共用 AccountManager / TwoAccountTest / ConfigLoader 等编排层。
 */

/** 单个账号的连接配置 */
export interface AccountConnectionConfig {
  /** Bot HTTP/WS 入口，e.g. "http://127.0.0.1:53000" */
  host: string
  /** 鉴权 token，可空 */
  apiKey?: string
  /** 协议名（"http" / "ws" / "sse" 等，由各协议自行定义可选值） */
  protocol: string
  /** Bot 自己的账号 ID，用于过滤双账号测试中"对方发的"事件 */
  user_id: string
}

/**
 * 协议无关的 API 客户端接口。OB11 是 action+params；Milky/Satori 把自己的调用语义
 * 收敛成一个 `call` 入口即可（多参数可包成 params 对象）。
 */
export interface IApiClient {
  /** 单次调用。返回结构由各协议定义 */
  call<R = unknown>(action: string, params?: unknown): Promise<R>

  /** 关闭底层连接（WS 等）。同步调用安全，无连接时也 no-op */
  disconnect(): void

  /** EventListener 需要拿配置（host / apiKey / 协议）来决定怎么订阅事件 */
  getConfig(): AccountConnectionConfig
}

/**
 * 协议无关的事件监听器接口。
 * - 启动后内部维护一个事件队列，`waitForEvent` 既消费已到队列的也等待新事件。
 * - filter 形状由协议自己定（OB11 是 `{post_type, message_type, ...}` 的子集）。
 */
export interface IEventListener<E = unknown, F = Partial<E>> {
  /** 启动订阅（SSE/WS 都在内部建立连接） */
  startListening(): Promise<void>

  /** 关闭订阅，清空 pending handler */
  stopListening(): void

  /** 清掉队列里还没 match 走的事件 */
  clearQueue(): void

  /**
   * 等待一个 match `filter` 且 `customFilter`（可选）返回 true 的事件。
   * 超时抛 TimeoutError。
   */
  waitForEvent(filter: F, customFilter?: (event: E) => boolean, timeoutMs?: number): Promise<E>
}
