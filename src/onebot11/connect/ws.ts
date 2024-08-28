import BaseAction from '../action/BaseAction'
import { Context } from 'cordis'
import { WebSocket, WebSocketServer } from 'ws'
import { llonebotError } from '@/common/globalVars'
import { IncomingMessage } from 'node:http'
import { OB11Return, OB11Message } from '../types'
import { OB11Response } from '../action/OB11Response'
import { ActionName } from '../action/types'
import { LifeCycleSubType, OB11LifeCycleEvent } from '../event/meta/OB11LifeCycleEvent'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { selfInfo } from '@/common/globalVars'
import { OB11BaseEvent } from '../event/OB11BaseEvent'
import { version } from '../../version'

class OB11WebSocket {
  private wsServer?: WebSocketServer
  private wsClients: WebSocket[] = []

  constructor(protected ctx: Context, public config: OB11WebSocket.Config) {
  }

  public start() {
    if (this.wsServer) return
    this.ctx.logger.info(`WebSocket server started 0.0.0.0:${this.config.port}`)
    try {
      this.wsServer = new WebSocketServer({ port: this.config.port, maxPayload: 1024 * 1024 * 1024 })
      llonebotError.wsServerError = ''
    } catch (e: any) {
      llonebotError.wsServerError = '正向 WebSocket 服务启动失败, ' + e.toString()
      return
    }
    this.wsServer?.on('connection', (socket, req) => {
      this.authorize(socket, req)
      this.connect(socket)
    })
  }

  public stop() {
    return new Promise<boolean>((resolve) => {
      llonebotError.wsServerError = ''
      if (this.wsServer) {
        this.wsServer.close((err) => {
          if (err) {
            return resolve(false)
          }
          resolve(true)
        })
        this.wsServer = undefined
      } else {
        resolve(true)
      }
    })
  }

  public async emitEvent(event: OB11BaseEvent | OB11Message) {
    this.wsClients.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event))
        this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', event.post_type)
      }
    })
  }

  public updateConfig(config: Partial<OB11WebSocket.Config>) {
    Object.assign(this.config, config)
  }

  private reply(socket: WebSocket, data: OB11Return<any> | OB11BaseEvent | OB11Message) {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }
    socket.send(JSON.stringify(data))
    if (data['post_type']) {
      this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', data['post_type'])
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
    let receive: { action: ActionName | null; params: any; echo?: any } = { action: null, params: {} }
    try {
      receive = JSON.parse(msg.toString())
      this.ctx.logger.info('收到正向 Websocket 消息', receive)
    } catch (e) {
      return this.reply(socket, OB11Response.error('json解析失败，请检查数据格式', 1400))
    }
    const action: BaseAction<any, any> = this.config.actionMap.get(receive.action!)!
    if (!action) {
      return this.reply(socket, OB11Response.error('不支持的api ' + receive.action, 1404, receive.echo))
    }
    try {
      const handleResult = await action.websocketHandle(receive.params, receive.echo)
      handleResult.echo = receive.echo
      this.reply(socket, handleResult)
    } catch (e: any) {
      this.reply(socket, OB11Response.error(`api处理出错:${e.stack}`, 1200, receive.echo))
    }
  }

  private connect(socket: WebSocket) {
    try {
      this.reply(socket, new OB11LifeCycleEvent(LifeCycleSubType.CONNECT))
    } catch (e) {
      this.ctx.logger.error('发送生命周期失败', e)
    }

    socket.on('error', err => this.ctx.logger.error(err.message))

    socket.on('message', msg => {
      this.handleAction(socket, msg.toString())
    })

    socket.on('ping', () => {
      socket.pong()
    })

    const disposeHeartBeat = this.ctx.setInterval(() => {
      this.reply(socket, new OB11HeartbeatEvent(selfInfo.online!, true, this.config.heartInterval))
    }, this.config.heartInterval)

    socket.on('close', () => {
      disposeHeartBeat()
      this.ctx.logger.info('有一个 Websocket 连接断开')
    })

    this.wsClients.push(socket)
  }
}

namespace OB11WebSocket {
  export interface Config {
    port: number
    heartInterval: number
    token?: string
    actionMap: Map<string, BaseAction<any, any>>
  }
}

class OB11WebSocketReverse {
  private running: boolean = false
  private wsClient?: WebSocket

  constructor(protected ctx: Context, public config: OB11WebSocketReverse.Config) {
  }

  public start() {
    if (!this.running) {
      this.running = true
      this.tryConnect()
    }
  }

  public stop() {
    this.running = false
    this.wsClient?.close()
  }

  public emitEvent(event: OB11BaseEvent | OB11Message) {
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      this.wsClient.send(JSON.stringify(event))
      this.ctx.logger.info('WebSocket 事件上报', this.wsClient.url ?? '', event.post_type)
    }
  }

  private reply(socket: WebSocket, data: OB11Return<any> | OB11BaseEvent | OB11Message) {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }
    socket.send(JSON.stringify(data))
    if (data['post_type']) {
      this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', data['post_type'])
    }
  }

  private async handleAction(msg: string) {
    let receive: { action: ActionName | null; params: any; echo?: any } = { action: null, params: {} }
    try {
      receive = JSON.parse(msg.toString())
      this.ctx.logger.info('收到反向Websocket消息', receive)
    } catch (e) {
      return this.reply(this.wsClient!, OB11Response.error('json解析失败，请检查数据格式', 1400, receive.echo))
    }
    const action: BaseAction<any, any> = this.config.actionMap.get(receive.action!)!
    if (!action) {
      return this.reply(this.wsClient!, OB11Response.error('不支持的api ' + receive.action, 1404, receive.echo))
    }
    try {
      let handleResult = await action.websocketHandle(receive.params, receive.echo)
      this.reply(this.wsClient!, handleResult)
    } catch (e) {
      this.reply(this.wsClient!, OB11Response.error(`api处理出错:${e}`, 1200, receive.echo))
    }
  }

  private tryConnect() {
    if (this.wsClient && !this.running) {
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
      this.ctx.logger.info('The websocket connection: ' + this.config.url + ' closed, trying reconnecting...')
      if (this.running) {
        this.ctx.setTimeout(() => this.tryConnect(), 3000)
      }
    })
  }
}

namespace OB11WebSocketReverse {
  export interface Config {
    url: string
    heartInterval: number
    token?: string
    actionMap: Map<string, BaseAction<any, any>>
  }
}

class OB11WebSocketReverseManager {
  private list: OB11WebSocketReverse[] = []

  constructor(protected ctx: Context, public config: OB11WebSocketReverseManager.Config) {
  }

  public async start() {
    for (const url of this.config.hosts) {
      this.ctx.logger.info('开始连接反向 WebSocket', url)
      try {
        this.list.push(new OB11WebSocketReverse(this.ctx, { ...this.config, url }))
      } catch (e: any) {
        this.ctx.logger.error(e.stack)
      }
    }
  }

  public stop() {
    for (const ws of this.list) {
      try {
        ws.stop()
      } catch (e: any) {
        this.ctx.logger.error('反向 WebSocket 关闭:', e.stack)
      }
    }
    this.list.length = 0
  }

  public async emitEvent(event: OB11BaseEvent | OB11Message) {
    for (const ws of this.list) {
      ws.emitEvent(event)
    }
  }

  public updateConfig(config: Partial<OB11WebSocketReverseManager.Config>) {
    Object.assign(this.config, config)
  }
}

namespace OB11WebSocketReverseManager {
  export interface Config {
    hosts: string[]
    heartInterval: number
    token?: string
    actionMap: Map<string, BaseAction<any, any>>
  }
}

export { OB11WebSocket, OB11WebSocketReverseManager }