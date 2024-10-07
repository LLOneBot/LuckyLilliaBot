import * as Universal from '@satorijs/protocol'
import express, { Express, Request, Response } from 'express'
import { Server } from 'node:http'
import { Context } from 'cordis'
import { handlers } from './api'
import { WebSocket, WebSocketServer } from 'ws'
import { promisify } from 'node:util'
import { ObjectToSnake } from 'ts-case-convert'
import { selfInfo } from '@/common/globalVars'

export class SatoriServer {
  private express: Express
  private httpServer?: Server
  private wsServer?: WebSocketServer
  private wsClients: WebSocket[] = []

  constructor(private ctx: Context, private config: SatoriServer.Config) {
    this.express = express()
    this.express.use(express.json({ limit: '50mb' }))
  }

  public start() {
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
        throw e
      }
    })

    const { listen, port } = this.config
    this.httpServer = this.express.listen(port, listen, () => {
      this.ctx.logger.info(`HTTP server started ${listen}:${port}`)
    })
    this.wsServer = new WebSocketServer({
      server: this.httpServer
    })

    this.wsServer.on('connection', (socket, req) => {
      const url = req.url?.split('?').shift()
      if (!['/v1/events', '/v1/events/'].includes(url!)) {
        return socket.close()
      }

      socket.addEventListener('message', async (event) => {
        let payload: Universal.ClientPayload
        try {
          payload = JSON.parse(event.data.toString())
        } catch (error) {
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
              logins: [await handlers.getLogin(this.ctx, {})]
            }
          } as Universal.ServerPayload))
          this.wsClients.push(socket)
        } else if (payload.op === Universal.Opcode.PING) {
          socket.send(JSON.stringify({
            op: Universal.Opcode.PONG,
            body: {},
          } as Universal.ServerPayload))
        }
      })
    })
  }

  public async stop() {
    if (this.wsServer) {
      const close = promisify(this.wsServer.close)
      await close.call(this.wsServer)
    }
    if (this.httpServer) {
      const close = promisify(this.httpServer.close)
      await close.call(this.httpServer)
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
          body
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
    listen: string
    token: string
  }
}
