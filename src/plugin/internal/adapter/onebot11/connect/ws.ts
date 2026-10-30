import { BaseAction } from '../action/BaseAction'
import { Context } from 'cordis'
import { RawData, WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'node:http'
import { OB11Return, OB11Message } from '../types'
import { OB11Response } from '../action/OB11Response'
import { ActionName } from '../action/types'
import { LifeCycleSubType, OB11LifeCycleEvent } from '../event/meta/OB11LifeCycleEvent'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { OB11BaseEvent } from '../event/OB11BaseEvent'
import { version } from '../../../../../version'
import { WsConnectConfig, WsReverseConnectConfig } from '@/common/types'
import { matchEventFilter } from '../eventfilter'

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

// JSON 解析失败时尽量从原始字节里抠出 echo, 让调用方能关联回包; 直接扫 Buffer, 免得整个 toString
function extractEcho(buf: Buffer): unknown {
  // "echo"
  const key = [0x22, 0x65, 0x63, 0x68, 0x6f, 0x22]
  const len = buf.length
  let keyIdx = -1
  outer: for (let i = 0; i <= len - key.length; i++) {
    for (let k = 0; k < key.length; k++) {
      if (buf[i + k] !== key[k]) continue outer
    }
    keyIdx = i
    break
  }
  if (keyIdx < 0) return undefined
  let i = keyIdx + key.length
  // 跳过空白
  while (i < len) {
    const b = buf[i]
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) break
    i++
  }
  if (buf[i] !== 0x3a /* ':' */) return undefined
  i++
  while (i < len) {
    const b = buf[i]
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) break
    i++
  }
  if (i >= len) return undefined

  const start = i
  const first = buf[i]

  let end = start
  if (first === 0x22 /* '"' */) {
    // 字符串, 注意转义
    i++
    while (i < len) {
      const b = buf[i]
      if (b === 0x5c) { i += 2; continue }
      if (b === 0x22) { i++; break }
      i++
    }
    end = i
  } else if (first === 0x7b /* '{' */ || first === 0x5b /* '[' */) {
    // 对象/数组：用深度配对，并跳过字符串内的括号
    const open = first
    const close = open === 0x7b ? 0x7d : 0x5d
    let depth = 0
    let inStr = false
    while (i < len) {
      const b = buf[i]
      if (inStr) {
        if (b === 0x5c) { i += 2; continue }
        if (b === 0x22) inStr = false
        i++
        continue
      }
      if (b === 0x22) inStr = true
      else if (b === open) depth++
      else if (b === close) {
        depth--
        if (depth === 0) { i++; break }
      }
      i++
    }
    end = i
  } else {
    // 标量：number / true / false / null，消费直到 , } ] 或空白
    while (i < len) {
      const b = buf[i]
      if (b === 0x2c || b === 0x7d || b === 0x5d ||
        b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) break
      i++
    }
    end = i
  }

  if (end <= start) return undefined
  const slice = buf.subarray(start, end).toString('utf8').trim()
  if (!slice) return undefined
  try {
    return JSON.parse(slice)
  } catch {
    return undefined
  }
}

class OB11WebSocket {
  private wsServer?: WebSocketServer
  private wsClients: { socket: WebSocket; emitEvent: boolean }[] = []
  private activated: boolean = false

  constructor(protected ctx: Context, public config: OB11WebSocket.Config) {
  }

  public start() {
    if (this.wsServer || !this.config.enable) {
      return
    }
    const host = this.config.host
    this.ctx.logger.info(`OneBot V11 WebSocket server started ${host}:${this.config.port}`)
    this.wsServer = new WebSocketServer({
      host,
      port: this.config.port,
      maxPayload: 0
    })
    this.wsServer.on('error', (err: Error) => {
      this.ctx.logger.error('OneBot V11 正向 WS 错误', err)
    })
    this.wsServer?.on('connection', (socket, req) => {
      if (this.authorize(socket, req)) {
        this.connect(socket, req)
        const url = req.url?.split('?').shift()
        this.ctx.logger.info('ws connect', url)
      } else {
        this.reply(socket, OB11Response.res(null, 'failed', 1403, 'token验证失败'))
        socket.close(1008, 'invalid access token')
        const url = req.url?.split('?').shift()
        this.ctx.logger.info('ws authentication failed', url)
      }
    })
    this.activated = true
  }

  public stop() {
    return new Promise<boolean>((resolve) => {
      this.ctx.logger.info('OneBot V11 WebSocket Server closing...')
      this.wsClients.forEach(({ socket }) => {
        try {
          socket.close()
        } catch (e) {
          this.ctx.logger.error('关闭 OneBot V11 WebSocket 客户端连接失败', e)
        }
      })
      this.wsClients = []
      if (this.wsServer) {
        this.wsServer.close((err) => {
          if (err) {
            this.ctx.logger.error(`OneBot V11 WebSocket Server closing ${err}`)
            return resolve(false)
          }
          this.ctx.logger.info('OneBot V11 WebSocket Server closed')
          resolve(true)
        })
        this.wsServer = undefined
      } else {
        resolve(true)
      }
      this.activated = false
    })
  }

  public async emitEvent(event: OB11BaseEvent) {
    event.self_id = +this.ctx.account.uin
    if (!matchEventFilter(this.config.filter, event)) return
    if (!this.activated) return
    this.wsClients.forEach(({ socket, emitEvent }) => {
      if (emitEvent && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event))
        const eventName = event.getSummaryEventName()
        this.ctx.logger.info('WebSocket 事件上报', eventName)
      }
    })
  }

  public async emitMessageLikeEvent(event: OB11BaseEvent, self: boolean, offline: boolean) {
    if (self && !this.config.reportSelfMessage) {
      return
    }
    if (offline && !this.config.reportOfflineMessage) {
      return
    }
    if (event.post_type === 'message' || event.post_type === 'message_sent') {
      const msg = event as OB11Message
      if (!this.config.debug && msg.message.length === 0) {
        return
      }
      if (!this.config.debug) {
        delete msg.raw
        delete msg.raw_pb
      }
      if (this.config.messageFormat === 'string') {
        msg.message = msg.raw_message
        msg.message_format = 'string'
      }
    }
    await this.emitEvent(event)
  }

  public updateConfig(config: Partial<OB11WebSocket.Config>) {
    Object.assign(this.config, config)
  }

  private reply(socket: WebSocket, data: OB11Return<unknown> | OB11BaseEvent | OB11Message) {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }
    if ('post_type' in data) data.self_id = +this.ctx.account.uin
    socket.send(JSON.stringify(data))
    if ('post_type' in data) {
      this.ctx.logger.info('WebSocket 事件上报', data.post_type)
    }
  }

  private authorize(socket: WebSocket, req: IncomingMessage) {
    if (this.config.token) {
      let clientToken = ''
      const authHeader = req.headers['authorization']
      if (authHeader) {
        clientToken = authHeader.split('Bearer ').pop()!
        this.ctx.logger.info('receive ws header token', clientToken)
      } else {
        const { searchParams } = new URL(`http://localhost${req.url}`)
        const urlToken = searchParams.get('access_token')
        if (urlToken) {
          clientToken = urlToken
          this.ctx.logger.info('receive ws url token', clientToken)
        }
      }
      if (clientToken !== this.config.token) {
        return false
      }
    }
    return true
  }

  private async handleAction(socket: WebSocket, data: RawData) {
    let receive: { action: ActionName | null, params: unknown, echo?: unknown } = { action: null, params: {} }
    try {
      receive = JSON.parse(data.toString())
      this.ctx.logger.info('收到正向 Websocket 消息', receive)
    } catch (error) {
      const echo = extractEcho(toBuffer(data))
      const { message } = error as Error
      return this.reply(socket, OB11Response.error(`JSON 解析失败: ${message}`, 1400, echo))
    }
    const action = this.config.actionMap.get(receive.action!)
    if (!action) {
      return this.reply(socket, OB11Response.error(`${receive.action} API 不存在`, 1404, receive.echo))
    }
    const handleResult = await action.websocketHandle(receive.params, receive.echo, {
      messageFormat: this.config.messageFormat,
      debug: this.config.debug
    })
    this.reply(socket, handleResult)
  }

  private connect(socket: WebSocket, req: IncomingMessage) {
    const url = req.url?.split('?').shift()
    let disposeHeartBeat: (() => void) | undefined

    if (['/api', '/api/', '/', undefined].includes(url)) {
      socket.on('message', data => {
        this.handleAction(socket, data)
      })
    }
    if (['/event', '/event/', '/', undefined].includes(url)) {
      try {
        this.reply(socket, new OB11LifeCycleEvent(LifeCycleSubType.CONNECT))
      } catch (e) {
        this.ctx.logger.error('发送生命周期失败', e)
      }

      disposeHeartBeat = this.ctx.interval(() => {
        const event = new OB11HeartbeatEvent(this.ctx.account.online, true, this.config.heartInterval)
        this.reply(socket, event)
      }, this.config.heartInterval)
    }

    socket.on('close', () => {
      disposeHeartBeat?.()
      this.wsClients = this.wsClients.filter(c => c.socket !== socket)
      this.ctx.logger.info('有一个 Websocket 连接断开')
    })

    socket.on('error', err => this.ctx.logger.error(err.message))

    socket.on('ping', () => {
      socket.pong()
    })

    this.wsClients.push({
      socket,
      emitEvent: ['/event', '/event/', '/', undefined].includes(url)
    })
  }
}

namespace OB11WebSocket {
  export interface Config extends WsConnectConfig {
    actionMap: Map<string, BaseAction<unknown, unknown>>
  }
}

class OB11WebSocketReverse {
  private activated: boolean = false
  private wsClient?: WebSocket

  constructor(protected ctx: Context, public config: OB11WebSocketReverse.Config) {
  }

  public start() {
    if (!this.config.enable) {
      return
    }
    if (!this.activated) {
      this.activated = true
      this.tryConnect()
    }
  }

  public stop() {
    this.activated = false
    this.wsClient?.close()
  }

  public async emitEvent(event: OB11BaseEvent) {
    event.self_id = +this.ctx.account.uin
    if (!matchEventFilter(this.config.filter, event)) return
    if (!this.activated) return
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      this.wsClient.send(JSON.stringify(event))
      const eventName = event.getSummaryEventName()
      this.ctx.logger.info('WebSocket 事件上报', this.wsClient.url ?? '', eventName)
    }
  }

  public async emitMessageLikeEvent(event: OB11BaseEvent, self: boolean, offline: boolean) {
    if (self && !this.config.reportSelfMessage) {
      return
    }
    if (offline && !this.config.reportOfflineMessage) {
      return
    }
    if (event.post_type === 'message' || event.post_type === 'message_sent') {
      const msg = event as OB11Message
      if (!this.config.debug && msg.message.length === 0) {
        return
      }
      if (!this.config.debug) {
        delete msg.raw
        delete msg.raw_pb
      }
      if (this.config.messageFormat === 'string') {
        msg.message = msg.raw_message
        msg.message_format = 'string'
      }
    }
    await this.emitEvent(event)
  }

  public updateConfig(config: Partial<OB11WebSocketReverse.Config>) {
    Object.assign(this.config, config)
  }

  private reply(socket: WebSocket, data: OB11Return<unknown> | OB11BaseEvent | OB11Message) {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }
    if ('post_type' in data) data.self_id = +this.ctx.account.uin
    socket.send(JSON.stringify(data))
    if ('post_type' in data) {
      this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', data.post_type)
    }
  }

  private async handleAction(data: RawData) {
    let receive: { action: ActionName | null, params: unknown, echo?: unknown } = { action: null, params: {} }
    try {
      receive = JSON.parse(data.toString())
      this.ctx.logger.info('收到反向 Websocket 消息', receive)
    } catch (error) {
      const echo = extractEcho(toBuffer(data))
      const { message } = error as Error
      return this.reply(this.wsClient!, OB11Response.error(`JSON 解析失败: ${message}`, 1400, echo))
    }
    const action = this.config.actionMap.get(receive.action!)
    if (!action) {
      return this.reply(this.wsClient!, OB11Response.error(`${receive.action} API 不存在`, 1404, receive.echo))
    }
    const handleResult = await action.websocketHandle(receive.params, receive.echo, {
      messageFormat: this.config.messageFormat,
      debug: this.config.debug
    })
    this.reply(this.wsClient!, handleResult)
  }

  private tryConnect() {
    if (this.wsClient && !this.activated) {
      return
    }
    this.wsClient = new WebSocket(this.config.url, {
      maxPayload: 0,
      handshakeTimeout: 2000,
      perMessageDeflate: false,
      headers: {
        'X-Self-ID': this.ctx.account.uin,
        'Authorization': `Bearer ${this.config.token}`,
        'x-client-role': 'Universal', // koishi-adapter-onebot 需要这个字段
        'User-Agent': `LLOneBot/${version}`,
      },
    })
    this.ctx.logger.info('Trying to connect to the websocket server: ' + this.config.url)

    this.wsClient.on('open', () => {
      this.ctx.logger.info('Connected to the websocket server: ' + this.config.url)
      try {
        this.reply(this.wsClient!, new OB11LifeCycleEvent(LifeCycleSubType.CONNECT))
      } catch (e) {
        this.ctx.logger.error('发送生命周期失败', e)
      }
    })

    this.wsClient.on('error', err => this.ctx.logger.error(err))

    this.wsClient.on('message', data => {
      this.handleAction(data)
    })

    this.wsClient.on('ping', () => {
      this.wsClient?.pong()
    })

    const disposeHeartBeat = this.ctx.interval(() => {
      if (this.wsClient) {
        const event = new OB11HeartbeatEvent(this.ctx.account.online, true, this.config.heartInterval)
        this.reply(this.wsClient, event)
      }
    }, this.config.heartInterval)

    this.wsClient.on('close', (code) => {
      disposeHeartBeat()
      this.ctx.logger.info(`The websocket connection: ${this.config.url} closed, code ${code}${this.activated ? ', trying reconnecting...' : ''}`)
      if (this.activated) {
        this.ctx.timeout(() => this.tryConnect(), 3000)
      }
    })
  }
}

namespace OB11WebSocketReverse {
  export interface Config extends WsReverseConnectConfig {
    actionMap: Map<string, BaseAction<unknown, unknown>>
  }
}

export { OB11WebSocket, OB11WebSocketReverse }
