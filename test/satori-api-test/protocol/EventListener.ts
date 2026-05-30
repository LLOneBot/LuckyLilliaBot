import WebSocket from 'ws'
import {
  IApiClient,
  IEventListener,
  TimeoutError,
} from '../../test-framework/src/index.js'

/**
 * Satori Event 形状：`{ id, type, timestamp, login, ... }`，type 是协议层定义的字符串：
 *   - 'message-created' / 'message-deleted' / 'message-updated'
 *   - 'reaction-added' / 'reaction-removed'
 *   - 'guild-added' / 'guild-removed' / 'guild-request'
 *   - 'guild-member-added' / 'guild-member-removed' / 'guild-member-request'
 *   - 'friend-request' / 'login-added' / 'login-removed' / ...
 * 不同 type event 的额外字段（user / channel / guild / message / member / role）由 type 决定。
 *
 * 见 Universal.Event from @satorijs/protocol。这里用 any 是因为测试只需要按 path 校验子字段。
 */
export interface SatoriEvent {
  id?: number
  sn?: number
  type: string
  timestamp?: number
  login?: any
  user?: any
  channel?: any
  guild?: any
  member?: any
  message?: any
  role?: any
  [key: string]: any
}

/** 跟 OB11 EventFilter 类似的浅匹配：顶层 type 必匹，其它 key 走深路径校验。 */
export interface SatoriEventFilter {
  type?: string
  [key: string]: unknown
}

/**
 * Satori 事件监听器。
 *
 * 协议层（详见 src/satori/server.ts 的 registerRoutes）：
 *   1. 客户端连 GET ws://host:port/v1/events 升级为 WS
 *   2. 客户端发 `{op: 3, body: {token: '<bearer>'}}` (IDENTIFY)
 *   3. 服务端回 `{op: 4, body: {logins: [...]}}` (READY) — 这之后才会推 EVENT
 *   4. 服务端推 `{op: 0, body: <Event>}` 流式事件
 *   5. 客户端心跳 `{op: 1, body: {}}` (PING)，server 回 `{op: 2, body: {}}` (PONG)
 *      (我们 30s heartbeat；jest 测试用例 timeout 一般 < 30s 所以可省掉)
 */
export class SatoriEventListener implements IEventListener<SatoriEvent, SatoriEventFilter> {
  private ws: WebSocket | null = null
  private listening = false
  private eventQueue: SatoriEvent[] = []
  private eventHandlers: Array<{
    filter: SatoriEventFilter
    customFilter?: (e: SatoriEvent) => boolean
    resolve: (e: SatoriEvent) => void
    reject: (err: Error) => void
    timeout: NodeJS.Timeout
  }> = []

  constructor(private client: IApiClient) {}

  async startListening(): Promise<void> {
    if (this.listening) return
    const cfg = this.client.getConfig()
    let wsUrl = cfg.host
    if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://')
    else if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://')
    if (!wsUrl.endsWith('/')) wsUrl += '/'
    wsUrl += 'v1/events'

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        // 立刻 IDENTIFY；server 回 READY 才算订阅成功
        this.ws!.send(JSON.stringify({
          op: 3, // IDENTIFY
          body: { token: cfg.apiKey || '' },
        }))
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        let payload: any
        try { payload = JSON.parse(data.toString()) } catch { return }
        if (payload.op === 4 /* READY */) {
          this.listening = true
          resolve()
          return
        }
        if (payload.op === 0 /* EVENT */) {
          this.handleEvent(payload.body as SatoriEvent)
          return
        }
        // PONG (op=2) 等其它 op 忽略
      })

      this.ws.on('error', (err) => {
        if (!this.listening) reject(err)
      })

      this.ws.on('close', () => {
        this.listening = false
        this.ws = null
        for (const h of this.eventHandlers) {
          clearTimeout(h.timeout)
          h.reject(new Error('Satori WS closed'))
        }
        this.eventHandlers = []
      })

      setTimeout(() => {
        if (!this.listening && this.ws) {
          this.ws.terminate()
          reject(new TimeoutError(`Satori WS connect/IDENTIFY timed out`, 10000))
        }
      }, 10000)
    })
  }

  stopListening(): void {
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.listening = false
    for (const h of this.eventHandlers) {
      clearTimeout(h.timeout)
      h.reject(new Error('Satori listener stopped'))
    }
    this.eventHandlers = []
    this.eventQueue = []
  }

  clearQueue(): void {
    this.eventQueue = []
  }

  waitForEvent(
    filter: SatoriEventFilter,
    customFilter?: (e: SatoriEvent) => boolean,
    timeoutMs = 15000,
  ): Promise<SatoriEvent> {
    // 先从已到队列里找
    const idx = this.eventQueue.findIndex(e => this.match(e, filter, customFilter))
    if (idx !== -1) {
      const [hit] = this.eventQueue.splice(idx, 1)
      return Promise.resolve(hit)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.eventHandlers.findIndex(h => h.timeout === timer)
        if (i !== -1) this.eventHandlers.splice(i, 1)
        reject(new TimeoutError(
          `Satori waitForEvent timeout after ${timeoutMs}ms. Filter: ${JSON.stringify(filter)}`,
          timeoutMs,
        ))
      }, timeoutMs)
      this.eventHandlers.push({ filter, customFilter, resolve, reject, timeout: timer })
    })
  }

  private handleEvent(event: SatoriEvent): void {
    // 优先派发给等待中的 handler
    for (let i = 0; i < this.eventHandlers.length; i++) {
      const h = this.eventHandlers[i]
      if (this.match(event, h.filter, h.customFilter)) {
        clearTimeout(h.timeout)
        this.eventHandlers.splice(i, 1)
        h.resolve(event)
        return
      }
    }
    // 没人等就入队，给后来的 waitForEvent 拿
    this.eventQueue.push(event)
    if (this.eventQueue.length > 200) this.eventQueue.shift()
  }

  private match(
    event: SatoriEvent,
    filter: SatoriEventFilter,
    customFilter?: (e: SatoriEvent) => boolean,
  ): boolean {
    for (const [k, want] of Object.entries(filter)) {
      const actual = (event as any)[k]
      if (actual === undefined && (event as any).message?.[k] !== undefined) {
        // 浅试一层：filter 写 'channel.id' 不便，常见用例如 channel id
        // 这里只 match 顶层；测试代码可以用 customFilter 做更深匹配
      }
      if (actual !== want) return false
    }
    if (customFilter && !customFilter(event)) return false
    return true
  }
}
