import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import { RawData, WebSocket } from 'ws'
import { CredentialError, QQOfficialApi } from './api'
import { GatewayPayload, Opcode, ReadyData } from './types'

export interface GatewayHandlers {
  ready(data: ReadyData): void
  dispatch(payload: GatewayPayload): void
  status(status: Status): void
}

export interface GatewayOptions {
  /** Used as is instead of asking GET /gateway */
  url?: string
  /** Logs every payload but heartbeat acks */
  debug?: boolean
}

/** Close codes after which the connection must not come back (bot.q.qq.com, websocket error codes) */
const FATAL = new Map([
  [4001, '无效的 opcode'],
  [4002, '无效的 payload'],
  [4010, '无效的 shard'],
  [4011, '连接需要处理的 guild 过多'],
  [4012, '无效的 version'],
  [4013, '无效的 intent, 检查订阅的事件'],
  [4014, 'intent 无权限, 检查订阅的事件'],
  [4914, '机器人已下架, 只能连接沙箱环境'],
  [4915, '机器人已封禁'],
])

/** The session is gone: identify again instead of resuming */
function sessionLost(code: number) {
  return code === 4006 || code === 4007 || (code >= 4900 && code <= 4913)
}

// Seconds before each further reconnect attempt
const BACKOFF = [1, 2, 5, 10, 30, 60]
// A connection that stayed up this long resets the backoff
const STABLE = 30_000

/**
 * The event gateway: identify, or resume a dropped session so missed events are replayed; heartbeat with the
 * last sequence number, and reconnect when a heartbeat goes unanswered.
 */
export class Gateway {
  private socket?: WebSocket
  private sessionId = ''
  private seq: number | null = null
  private acked = true
  private attempt = 0
  private readyAt = 0
  private stopped = false
  private stopHeartbeat?: () => void
  private stopRetry?: () => void
  private logger

  constructor(
    private ctx: Context,
    private api: QQOfficialApi,
    private intents: number,
    private handlers: GatewayHandlers,
    private backoff = BACKOFF.map(seconds => seconds * 1000),
    private options: GatewayOptions = {},
  ) {
    this.logger = ctx.logger('qq-official')
  }

  start() {
    this.stopped = false
    void this.connect()
  }

  stop() {
    this.stopped = true
    this.stopRetry?.()
    this.stopHeartbeat?.()
    const socket = this.socket
    this.socket = undefined
    socket?.close(1000)
    this.handlers.status(Status.OFFLINE)
  }

  private async connect() {
    this.stopRetry = undefined
    if (this.stopped) return
    this.handlers.status(this.sessionId ? Status.RECONNECT : Status.CONNECT)
    let url: string
    try {
      url = this.options.url || this.onApiHost((await this.api.request<{ url: string }>('GET', '/gateway')).url)
    } catch (e) {
      if (e instanceof CredentialError) return this.halt(e.message)
      this.logger.warn('获取网关地址失败: %s', (e as Error).message)
      return this.retry()
    }
    if (this.stopped) return
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (e) {
      this.logger.warn('网关地址无效 %s: %s', url, (e as Error).message)
      return this.retry()
    }
    this.socket = socket
    socket.on('message', data => this.receive(socket, data))
    socket.on('close', (code, reason) => this.closed(socket, code, reason.toString()))
    socket.on('error', e => this.logger.warn('网关连接出错: %s', e.message))
  }

  // The platform's gateway on the host the API is on: api.sgroup.qq.com and
  // api.bot.qq.com serve the same, and a custom or sandbox endpoint keeps its own
  private onApiHost(url: string): string {
    if (!this.api.base) return url
    try {
      const gateway = new URL(url)
      if (!/(^|\.)qq\.com$/i.test(gateway.hostname)) return url
      gateway.host = new URL(this.api.base).host
      return gateway.toString()
    } catch {
      return url
    }
  }

  private receive(socket: WebSocket, data: RawData) {
    let payload: GatewayPayload
    try {
      payload = JSON.parse(data.toString())
    } catch {
      return this.logger.warn('无法解析的网关消息: %s', data.toString().slice(0, 200))
    }
    if (this.options.debug && payload.op !== Opcode.HeartbeatAck) this.logger.info('网关消息: %o', payload)
    switch (payload.op) {
      case Opcode.Hello:
        return void this.hello(socket, payload.d.heartbeat_interval)
      case Opcode.HeartbeatAck:
        this.acked = true
        return
      case Opcode.Heartbeat:
        return this.sendHeartbeat(socket)
      case Opcode.Dispatch:
        return this.dispatch(payload)
      case Opcode.Reconnect:
        this.logger.info('网关要求重连')
        return socket.close(4000, 'reconnect requested')
      case Opcode.InvalidSession:
        this.logger.warn('会话失效, 重新鉴权')
        this.sessionId = ''
        this.seq = null
        return socket.close(4000, 'invalid session')
    }
  }

  private async hello(socket: WebSocket, interval: number) {
    let token: string
    try {
      token = `QQBot ${await this.api.accessToken()}`
    } catch (e) {
      if (e instanceof CredentialError) {
        socket.close(1000)
        return this.halt(e.message)
      }
      this.logger.warn('%s', (e as Error).message)
      return socket.close(4000, 'no access token')
    }
    if (this.socket !== socket) return
    this.acked = true
    if (this.sessionId) {
      socket.send(JSON.stringify({ op: Opcode.Resume, d: { token, session_id: this.sessionId, seq: this.seq } }))
    } else {
      socket.send(JSON.stringify({ op: Opcode.Identify, d: { token, intents: this.intents, shard: [0, 1] } }))
    }
    this.stopHeartbeat?.()
    this.stopHeartbeat = this.ctx.interval(() => this.heartbeat(socket), interval)
  }

  private heartbeat(socket: WebSocket) {
    // No ack since the last one: the connection is dead even if the socket has not noticed
    if (!this.acked) {
      this.logger.warn('网关心跳无响应, 重新连接')
      this.stopHeartbeat?.()
      this.stopHeartbeat = undefined
      return socket.terminate()
    }
    this.acked = false
    this.sendHeartbeat(socket)
  }

  private sendHeartbeat(socket: WebSocket) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: Opcode.Heartbeat, d: this.seq }))
  }

  private dispatch(payload: GatewayPayload) {
    if (typeof payload.s === 'number') this.seq = payload.s
    if (payload.t === 'READY') {
      const data: ReadyData = payload.d
      this.sessionId = data.session_id
      this.readyAt = Date.now()
      this.handlers.ready(data)
      this.handlers.status(Status.ONLINE)
    } else if (payload.t === 'RESUMED') {
      this.readyAt = Date.now()
      this.logger.info('网关会话已恢复')
      this.handlers.status(Status.ONLINE)
    } else {
      // Thrown here it would surface from the socket's message listener
      try {
        this.handlers.dispatch(payload)
      } catch (e) {
        this.logger.warn('处理事件 %s 失败: %s', payload.t, (e as Error).message)
      }
    }
  }

  private closed(socket: WebSocket, code: number, reason: string) {
    if (this.socket !== socket) return
    this.socket = undefined
    this.stopHeartbeat?.()
    this.stopHeartbeat = undefined
    if (this.stopped) return
    const fatal = FATAL.get(code)
    if (fatal) return this.halt(`网关断开 (${code}): ${fatal}`)
    if (sessionLost(code)) {
      this.sessionId = ''
      this.seq = null
    }
    // Most likely an expired token
    if (code === 4004) this.api.invalidateToken()
    if (this.readyAt && Date.now() - this.readyAt > STABLE) this.attempt = 0
    this.readyAt = 0
    this.logger.info('网关连接断开 (%d%s), 准备重连', code, reason ? `: ${reason}` : '')
    // 4008: sending too fast
    this.retry(code === 4008 ? 10_000 : 0)
  }

  private retry(atLeast = 0) {
    this.handlers.status(Status.RECONNECT)
    const delay = Math.max(atLeast, this.backoff[Math.min(this.attempt, this.backoff.length - 1)])
    this.attempt++
    this.stopRetry = this.ctx.timeout(() => void this.connect(), delay)
  }

  private halt(message: string) {
    this.logger.error('%s, 已停止重连', message)
    this.stopped = true
    this.handlers.status(Status.OFFLINE)
  }
}
