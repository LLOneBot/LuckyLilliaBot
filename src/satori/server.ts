import * as Universal from '@satorijs/protocol'
import express, { Express, Request, Response } from 'express'
import { Server } from 'node:http'
import { Context } from 'cordis'
import { handlers } from './api'
import { WebSocket, WebSocketServer } from 'ws'
import { ObjectToSnake } from 'ts-case-convert'
import { selfInfo } from '@/common/globalVars'
import { initActionMap } from '@/onebot11/action'
import { OB11Response } from '@/onebot11/action/OB11Response'
import { ParseMessageConfig } from '@/onebot11/types'

export class SatoriServer {
  private express: Express
  private httpServer?: Server
  private wsServer?: WebSocketServer
  private wsClients: WebSocket[] = []
  private actionMap: Map<string, { handle: (params: any, config: ParseMessageConfig) => Promise<any> }>
  private routesRegistered = false

  constructor(private ctx: Context, private config: SatoriServer.Config) {
    this.express = express()
    this.express.use(express.json({ limit: '50mb' }))
    this.actionMap = initActionMap(this as any)
  }

  async CallOneBot11API(action: string, params: any): Promise<any> {
    const handler = this.actionMap.get(action)
    if (!handler) {
      throw new Error(`Unsupported OB11 action: ${action}`)
    }
    return handler.handle(params, {
      messageFormat: 'array',
      debug: false
    })
  }

  private async handleOneBotRequest(req: Request, res: Response) {
    if (this.checkAuth(req, res)) return

    const action = req.params.action
    const params = req.method === 'POST' ? req.body : req.query
    let result
    try {
      result = await this.CallOneBot11API(action as string, params)
    } catch (e) {
      result = OB11Response.error((e as Error)?.toString() ?? String(e), 200)
    }

    res.json(result)
  }

  public start() {
    if (!this.routesRegistered) {
      this.registerRoutes()
      this.routesRegistered = true
    }

    const { host, port } = this.config
    this.httpServer = this.express.listen(port, host, () => {
      this.ctx.logger.info(`Satori server started ${host || '0.0.0.0'}:${port}`)
    })
    this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        this.ctx.logger.warn(`端口 ${port} 已被占用`)
      } else {
        this.ctx.logger.error('Failed to start Satori server:', error)
      }
    })
    this.wsServer = new WebSocketServer({ server: this.httpServer })
    this.wsServer.on('connection', (socket, req) => {
      const url = req.url?.split('?').shift()
      if (!['/v1/events', '/v1/events/'].includes(url!)) {
        return socket.close(1008, 'invalid address')
      }

      socket.addEventListener('message', async (event) => {
        let payload: Universal.ClientPayload
        try {
          payload = JSON.parse(event.data.toString())
        } catch {
          return socket.close(4000, 'invalid message')
        }

        if (payload.op === Universal.Opcode.IDENTIFY) {
          if (this.config.token && payload.body?.token !== this.config.token) {
            return socket.close(4004, 'invalid token')
          }
          this.ctx.logger.info('ws connect', url)
          socket.send(JSON.stringify({
            op: Universal.Opcode.READY,
            body: {
              logins: [await handlers.getLogin(this.ctx, {}) as Universal.Login],
              proxy_urls: [],
            },
          } as ObjectToSnake<Universal.ServerPayload>))
          this.wsClients.push(socket)
        }
        else if (payload.op === Universal.Opcode.PING) {
          socket.send(JSON.stringify({
            op: Universal.Opcode.PONG,
            body: {},
          } as Universal.ServerPayload))
        }
      })
    })
  }

  private registerRoutes() {
    this.express.route('/v1/internal/onebot11/:action')
      .post(this.handleOneBotRequest.bind(this))
      .get(this.handleOneBotRequest.bind(this))

    this.express.get('/v1/:name', async (req, res) => {
      res.status(405).send('Please use POST method to send requests.')
    })

    this.express.post('/v1/:name', async (req, res) => {
      const method = Universal.Methods[req.params.name]
      if (!method) {
        res.status(404).send('method not found')
        return
      }

      if (this.checkAuth(req, res)) return

      const selfId = req.headers['satori-user-id'] ?? req.headers['x-self-id']
      const platform = req.headers['satori-platform'] ?? req.headers['x-platform']
      if (selfId !== selfInfo.uin || !platform) {
        res.status(403).send('login not found')
        return
      }

      const handle = handlers[method.name]
      if (!handle) {
        res.status(404).send('method not found')
        return
      }
      try {
        const result = await handle(this.ctx, req.body)
        res.json(result)
      } catch (e) {
        this.ctx.logger.error(e)
        res.status(500).send((e as Error).message)
      }
    })
  }

  public async stop() {
    for (const socket of this.wsClients) {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000)
        }
      } catch {
      }
    }
    this.wsClients = []

    if (this.wsServer) {
      await new Promise<void>((resolve) => {
        this.wsServer!.close(() => resolve())
      })
      this.wsServer = undefined
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
      this.httpServer = undefined
    }
  }

  private checkAuth(req: Request, res: Response) {
    if (!this.config.token) return
    if (req.headers.authorization !== `Bearer ${this.config.token}`) {
      res.status(403).send('invalid token')
      return true
    }
  }

  public async dispatch(body: ObjectToSnake<Universal.Event>) {
    this.wsClients.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          op: Universal.Opcode.EVENT,
          body,
        } as ObjectToSnake<Universal.ServerPayload>))
        this.ctx.logger.info('WebSocket 事件上报', socket.url ?? '', body.type)
      }
    })
  }

  public updateConfig(config: SatoriServer.Config) {
    Object.assign(this.config, config)
  }
}

namespace SatoriServer {
  export interface Config {
    port: number
    host: string
    token: string
  }
}
