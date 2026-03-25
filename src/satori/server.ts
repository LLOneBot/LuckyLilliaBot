import * as Universal from '@satorijs/protocol'
import { Context } from 'cordis'
import { handlers } from './api'
import { WebSocket, WebSocketServer } from 'ws'
import { ObjectToSnake } from 'ts-case-convert'
import { selfInfo } from '@/common/globalVars'
import { initActionMap } from '@/onebot11/action'
import { OB11Response } from '@/onebot11/action/OB11Response'
import { ParseMessageConfig } from '@/onebot11/types'
import { Hono, Context as HonoContext, Next } from 'hono'
import { cors } from 'hono/cors'
import { serve, ServerType } from '@hono/node-server'
import { WSContext } from 'hono/ws'
import { createNodeWebSocket, NodeWebSocket } from '@hono/node-ws'

export class SatoriServer {
  private app: Hono
  private httpServer?: ServerType
  private wsServer?: WebSocketServer
  private wsClients: WSContext[] = []
  private actionMap?: Map<string, { handle: (params: any, config: ParseMessageConfig) => Promise<any> }>
  private routesRegistered = false
  private injectWebSocket?: NodeWebSocket['injectWebSocket']

  constructor(private ctx: Context, private config: SatoriServer.Config) {
    this.app = new Hono()
  }

  async callOneBot11API(action: string, params: any): Promise<any> {
    const onebotAdapter = this.ctx.get('onebot')
    if (onebotAdapter) {
      this.actionMap ??= initActionMap(onebotAdapter)
    } else {
      throw new Error(`OB11 service has not started`)
    }
    const handler = this.actionMap.get(action)
    if (!handler) {
      throw new Error(`Unsupported OB11 action: ${action}`)
    }
    return await handler.handle(params, {
      messageFormat: 'array',
      debug: false
    })
  }

  private async handleOneBotRequest(c: HonoContext, next: Next) {
    const action = c.req.param('action')!
    const payload = c.req.method === 'POST' ? await c.req.json() : c.req.query()
    let result
    try {
      result = await this.callOneBot11API(action, payload)
    } catch (e) {
      result = OB11Response.error((e as Error).message, 200)
    }

    return c.json(result)
  }

  public start() {
    if (!this.routesRegistered) {
      this.registerRoutes()
      this.routesRegistered = true
    }

    const { host, port } = this.config
    this.httpServer = serve({
      fetch: this.app.fetch,
      port: port,
      hostname: host
    }, () => {
      this.ctx.logger.info(`Satori server started ${host || '0.0.0.0'}:${port}`)
    })
    this.injectWebSocket?.(this.httpServer)
  }

  private registerRoutes() {
    // TODO: 待 https://github.com/honojs/middleware/pull/1808 通过后，将 maxPayload 指定为 constants.MAX_STRING_LENGTH
    // 默认的 maxPayload 为 100 MiB
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: this.app })
    this.injectWebSocket = injectWebSocket

    this.app.get('/v1/events',
      upgradeWebSocket((c) => {
        return {
          onMessage: async (event, ws) => {
            let payload: Universal.ClientPayload
            try {
              payload = JSON.parse(event.data.toString())
            } catch {
              return ws.close(4000, 'invalid message')
            }

            if (payload.op === Universal.Opcode.IDENTIFY) {
              if (this.config.token && payload.body?.token !== this.config.token) {
                return ws.close(4004, 'invalid token')
              }
              this.ctx.logger.info('ws connect', c.req.path)
              ws.send(JSON.stringify({
                op: Universal.Opcode.READY,
                body: {
                  logins: [await handlers.getLogin(this.ctx, {}) as Universal.Login],
                  proxy_urls: [],
                },
              } satisfies ObjectToSnake<Universal.ServerPayload>))
              this.wsClients.push(ws)
            }
            else if (payload.op === Universal.Opcode.PING) {
              ws.send(JSON.stringify({
                op: Universal.Opcode.PONG,
                body: {},
              } satisfies Universal.ServerPayload))
            }
          }
        }
      })
    )

    this.app.use('/v1/*', cors())

    this.app.use('/v1/*', this.checkAuth.bind(this))

    this.app.use('/v1/internal/onebot11/:action', this.handleOneBotRequest.bind(this))

    this.app.get('/v1/*', async (c) => {
      return c.text('Please use POST method to send requests.', 405)
    })

    this.app.post('/v1/:name', async (c, next) => {
      const selfId = c.req.header('Satori-User-ID')
      const platform = c.req.header('Satori-Platform')
      if (selfId !== selfInfo.uin || !platform) {
        return c.text('login not found', 403)
      }

      const method = Universal.Methods[c.req.param('name')]
      if (!method) {
        return c.text('method not found', 404)
      }

      const handle = handlers[method.name]
      if (!handle) {
        return c.text('method not found', 404)
      }
      try {
        const result = await handle(this.ctx, await c.req.json())
        return c.json(result)
      } catch (e) {
        this.ctx.logger.error(e)
        return c.text((e as Error).message, 500)
      }
    })
  }

  public async stop() {
    for (const socket of this.wsClients) {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close()
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

  private async checkAuth(c: HonoContext, next: Next) {
    if (!this.config.token) return await next()
    if (c.req.header('Authorization') !== `Bearer ${this.config.token}`) {
      return c.text('invalid token', 403)
    }
    await next()
  }

  public async dispatch(body: ObjectToSnake<Universal.Event>) {
    this.wsClients.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          op: Universal.Opcode.EVENT,
          body,
        } satisfies ObjectToSnake<Universal.ServerPayload>))
        this.ctx.logger.info('WebSocket 事件上报', body.type)
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
