import { BaseAction } from '../action/BaseAction'
import { Context } from 'cordis'
import { WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'node:http'
import { OB11Return, OB11Message } from '../types'
import { OB11Response } from '../action/OB11Response'
import { ActionName } from '../action/types'
import { LifeCycleSubType, OB11LifeCycleEvent } from '../event/meta/OB11LifeCycleEvent'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { selfInfo } from '@/common/globalVars'
import { OB11BaseEvent } from '../event/OB11BaseEvent'
import { version } from '../../version'
import { WsConnectConfig, WsReverseConnectConfig } from '@/common/types'

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
    const host = this.config.onlyLocalhost ? '127.0.0.1' : ''
    this.ctx.logger.info(`OneBot V11 WebSocket server started ${host}:${this.config.port}`)
    this.wsServer = new WebSocketServer({
      host,
      port: this.config.port,
      maxPayload: 1024 * 1024 * 1024
    })
    this.wsServer.on('error', (err: Error) => {
      this.ctx.logger.error('OneBot V11 正向 WS 错误', err)
    })
    this.wsServer?.on('connection', (socket, req) => {
      this.authorize(socket, req)
      this.connect(socket, req)
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
    if (!this.activated) return
    this.wsClients.forEach(({ socket, emitEvent }) => {
      if (emitEvent && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event))
        const eventName = event.getSummaryEventName()
        this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', eventName)
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
    socket.send(JSON.stringify(data))
    if ('post_type' in data) {
      this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', data.post_type)
    }
  }

  private authorize(socket: WebSocket, req: IncomingMessage) {
    const url = req.url?.split('?').shift()
    this.ctx.logger.info('ws connect', url)
    let clientToken = ''
    const authHeader = req.headers['authorization']
    if (authHeader) {
      clientToken = authHeader.split('Bearer ').pop()!
      this.ctx.logger.info('receive ws header token', clientToken)
    } else {
      const { searchParams } = new URL(`http://localhost${req.url}`)
      const urlToken = searchParams.get('access_token')
      if (urlToken) {
        if (Array.isArray(urlToken)) {
          clientToken = urlToken[0]
        } else {
          clientToken = urlToken
        }
        this.ctx.logger.info('receive ws url token', clientToken)
      }
    }
    if (this.config.token && clientToken !== this.config.token) {
      this.reply(socket, OB11Response.res(null, 'failed', 1403, 'token验证失败'))
      return socket.close()
    }
  }

  private async handleAction(socket: WebSocket, msg: string) {
    let receive: { action: ActionName | null; params: unknown; echo?: unknown } = { action: null, params: {} }
    try {
      receive = JSON.parse(msg.toString())
      this.ctx.logger.info('收到正向 Websocket 消息', receive)
    } catch (e) {
      return this.reply(socket, OB11Response.error('JSON 解析失败，请检查数据格式', 1400))
    }
    const action = this.config.actionMap.get(receive.action!)!
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
    if (['/api', '/api/', '/', undefined].includes(url)) {
      socket.on('message', msg => {
        this.handleAction(socket, msg.toString())
      })
    }
    if (['/event', '/event/', '/', undefined].includes(url)) {
      try {
        this.reply(socket, new OB11LifeCycleEvent(LifeCycleSubType.CONNECT))
      } catch (e) {
        this.ctx.logger.error('发送生命周期失败', e)
      }

      const disposeHeartBeat = this.ctx.setInterval(() => {
        this.reply(socket, new OB11HeartbeatEvent(selfInfo.online!, true, this.config.heartInterval))
      }, this.config.heartInterval)

      socket.on('close', () => {
        disposeHeartBeat()
        this.ctx.logger.info('有一个 Websocket 连接断开')
      })
    }

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
    onlyLocalhost: boolean
  }
}

class OB11WebSocketReverse {
  private activated: boolean = false
  private wsClient?: WebSocket

  constructor(protected ctx: Context, public config: OB11WebSocketReverse.Config) {
  }

  public start() {
    if (!this.config.enable){
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
    socket.send(JSON.stringify(data))
    if ('post_type' in data) {
      this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', data.post_type)
    }
  }

  private async handleAction(msg: string) {
    let receive: { action: ActionName | null; params: unknown; echo?: unknown } = { action: null, params: {} }
    try {
      receive = JSON.parse(msg.toString())
      this.ctx.logger.info('收到反向 Websocket 消息', receive)
    } catch (e) {
      return this.reply(this.wsClient!, OB11Response.error('JSON 解析失败，请检查数据格式', 1400, receive.echo))
    }
    const action = this.config.actionMap.get(receive.action!)!
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
      maxPayload: 1024 * 1024 * 1024,
      handshakeTimeout: 2000,
      perMessageDeflate: false,
      headers: {
        'X-Self-ID': selfInfo.uin,
        'Authorization': `Bearer ${this.config.token}`,
        'x-client-role': 'Universal', // koishi-adapter-onebot 需要这个字段
        'User-Agent': `LLTwoBot/${version}`,
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
      this.handleAction(data.toString())
    })

    this.wsClient.on('ping', () => {
      this.wsClient?.pong()
    })

    const disposeHeartBeat = this.ctx.setInterval(() => {
      if (this.wsClient) {
        this.reply(this.wsClient, new OB11HeartbeatEvent(selfInfo.online!, true, this.config.heartInterval))
      }
    }, this.config.heartInterval)

    this.wsClient.on('close', () => {
      disposeHeartBeat()
      this.ctx.logger.info(`The websocket connection: ${this.config.url} closed${this.activated ? ', trying reconnecting...' : ''}`)
      if (this.activated) {
        this.ctx.setTimeout(() => this.tryConnect(), 3000)
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
