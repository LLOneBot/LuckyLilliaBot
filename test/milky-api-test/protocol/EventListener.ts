import WebSocket from 'ws'
import { isDeepStrictEqual } from 'node:util'
import {
  IApiClient,
  IEventListener,
  TimeoutError,
} from '../../test-framework/src/index.js'

/**
 * Milky 事件统一形状：`{ time, self_id, event_type, data }`。`data` 内部按 event_type 不同。
 */
export interface MilkyEvent {
  time: number
  self_id: number
  event_type: string
  data: any
}

/**
 * 事件过滤器：常见用法是按 event_type + data 内字段（group_id / user_id / message_seq）匹配。
 * 顶层支持 event_type；其它字段会到 event.data 里深度对比。
 */
export interface MilkyEventFilter {
  event_type?: string
  /** 任意字段会从 event.data 里深度对比（支持 group_id/user_id/message_seq 等） */
  [key: string]: unknown
}

/**
 * Milky 事件监听器：连 `<host>/event` 的 WS（也支持 SSE，但这里用 WS）。
 */
export class MilkyEventListener implements IEventListener<MilkyEvent, MilkyEventFilter> {
  private ws: WebSocket | null = null
  private listening = false
  private eventQueue: MilkyEvent[] = []
  private eventHandlers: Array<{
    filter: MilkyEventFilter
    customFilter?: (e: MilkyEvent) => boolean
    resolve: (e: MilkyEvent) => void
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
    wsUrl += 'event'

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {}
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`
      this.ws = new WebSocket(wsUrl, { headers })

      this.ws.on('open', () => {
        this.listening = true
        resolve()
      })
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString()) as MilkyEvent
          this.handleEvent(event)
        } catch (e) {
          // ignore parse error
        }
      })
      this.ws.on('error', (err) => {
        if (!this.listening) reject(err)
      })
      this.ws.on('close', () => {
        this.listening = false
        this.ws = null
        for (const h of this.eventHandlers) {
          clearTimeout(h.timeout)
          h.reject(new Error('Milky WS closed'))
        }
        this.eventHandlers = []
      })
      setTimeout(() => {
        if (!this.listening && this.ws) {
          this.ws.terminate()
          reject(new TimeoutError(`Milky WS connect timed out`, 10000))
        }
      }, 10000)
    })
  }

  stopListening(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    for (const h of this.eventHandlers) {
      clearTimeout(h.timeout)
      h.reject(new Error('Listener stopped'))
    }
    this.eventHandlers = []
    this.eventQueue = []
    this.listening = false
  }

  clearQueue(): void {
    this.eventQueue = []
  }

  private matchesFilter(event: MilkyEvent, filter: MilkyEventFilter): boolean {
    if (filter.event_type !== undefined && event.event_type !== filter.event_type) return false
    for (const key of Object.keys(filter)) {
      if (key === 'event_type') continue
      // 在 event.data 里查
      const target = (event.data as any)?.[key]
      const expected = filter[key]
      // 数字 ↔ 字符串宽松比较
      if (typeof expected === 'number' && typeof target === 'string') {
        if (+target !== expected) return false
      } else if (typeof expected === 'string' && typeof target === 'number') {
        if (target !== +expected) return false
      } else if (!isDeepStrictEqual(target, expected)) {
        return false
      }
    }
    return true
  }

  private handleEvent(event: MilkyEvent): void {
    // 先看有没有 pending handler 想要这个事件，有就消费掉别进队列
    for (let i = this.eventHandlers.length - 1; i >= 0; i--) {
      const h = this.eventHandlers[i]
      if (this.matchesFilter(event, h.filter) && (!h.customFilter || h.customFilter(event))) {
        clearTimeout(h.timeout)
        this.eventHandlers.splice(i, 1)
        h.resolve(event)
        return
      }
    }
    this.eventQueue.push(event)
  }

  async waitForEvent(
    filter: MilkyEventFilter,
    customFilter?: (event: MilkyEvent) => boolean,
    timeoutMs = 20000,
  ): Promise<MilkyEvent> {
    // 先扫现有队列
    for (let i = 0; i < this.eventQueue.length; i++) {
      const e = this.eventQueue[i]
      if (this.matchesFilter(e, filter) && (!customFilter || customFilter(e))) {
        this.eventQueue.splice(i, 1)
        return e
      }
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = this.eventHandlers.findIndex((h) => h.timeout === t)
        if (idx !== -1) this.eventHandlers.splice(idx, 1)
        reject(new TimeoutError(
          `Milky waitForEvent timeout after ${timeoutMs}ms. Filter: ${JSON.stringify(filter)}`,
          timeoutMs,
        ))
      }, timeoutMs)
      this.eventHandlers.push({ filter, customFilter, resolve, reject, timeout: t })
    })
  }
}
