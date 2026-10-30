import WebSocket from 'ws'
import {
  IApiClient,
  IEventListener,
  TimeoutError,
} from '../../test-framework/src/index.js'

/** 见 @satorijs/protocol 的 Universal.Event; 测试只按字段校验, 所以都用 any */
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

/** 只比顶层字段 */
export interface SatoriEventFilter {
  type?: string
  [key: string]: unknown
}

/**
 * 连 ws://host:port/v1/events, 发 IDENTIFY (op 3) 带 token, 收到 READY (op 4) 之后才有 EVENT (op 0)。
 * 不发 PING (op 1): 心跳 30s 一次, 用例一般撑不到 30s
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
    // 有等待中的 handler 要它就直接消费, 不进队列
    for (let i = 0; i < this.eventHandlers.length; i++) {
      const h = this.eventHandlers[i]
      if (this.match(event, h.filter, h.customFilter)) {
        clearTimeout(h.timeout)
        this.eventHandlers.splice(i, 1)
        h.resolve(event)
        return
      }
    }
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
      // id 类字段有时是 number 有时是 string (见 src/plugin/internal/service/ntqq-universal/utils.ts), 按 String 比
      if (actual === want) continue
      if (actual !== undefined && want !== undefined && String(actual) === String(want)) continue
      return false
    }
    if (customFilter && !customFilter(event)) return false
    return true
  }
}
