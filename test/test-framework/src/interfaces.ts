// OB11 / Milky / Satori 各自实现这些接口, 共用 AccountManager / TwoAccountTest 等

export interface AccountConnectionConfig {
  /** Bot HTTP/WS 入口，e.g. "http://127.0.0.1:53000" */
  host: string
  apiKey?: string
  /** "http" / "ws" / "sse" 等, 各协议自己定 */
  protocol: string
  /** Bot 自己的账号 ID，用于过滤双账号测试中"对方发的"事件 */
  user_id: string
}

/** OB11 是 action + params, 其他协议把调用收敛成 call(方法名, 参数对象) */
export interface IApiClient {
  call<R = unknown>(action: string, params?: unknown): Promise<R>

  /** 没连接时是 no-op */
  disconnect(): void

  /** EventListener 靠它决定怎么订阅事件 */
  getConfig(): AccountConnectionConfig
}

/** filter 的形状由各协议定, 比如 OB11 是事件字段的子集 */
export interface IEventListener<E = unknown, F = Partial<E>> {
  startListening(): Promise<void>

  stopListening(): void

  clearQueue(): void

  /** 先找已收到的, 没有再等新事件; 超时抛 TimeoutError */
  waitForEvent(filter: F, customFilter?: (event: E) => boolean, timeoutMs?: number): Promise<E>
}
