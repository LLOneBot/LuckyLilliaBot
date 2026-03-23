import { MilkyHttpConfig } from '@/common/types'
import { MilkyAdapter } from '@/milky/adapter'
import { Failed } from '@/milky/common/api'
import { Context } from 'cordis'
import { createNodeWebSocket } from '@hono/node-ws'
import { serve, ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { WSContext } from 'hono/ws'
import { constants } from 'node:buffer'

class MilkyHttpHandler {
  readonly eventPushClients = new Set<WSContext>()
  readonly sseClients = new Set<SSEStreamingApi>()
  private app: Hono | undefined
  private httpServer: ServerType | undefined

  /**
   * Extract token from Authorization header or query parameter
   */
  private extractToken(headers: Record<string, string>, query: Record<string, string>): string {
    const authHeader = headers['authorization']
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim()
    }
    return query['access_token']
  }

  /**
   * Validate access token
   */
  private validateToken(inputToken: string): boolean {
    if (!this.config.accessToken) return true
    return inputToken === this.config.accessToken
  }

  constructor(readonly milkyAdapter: MilkyAdapter, readonly ctx: Context, readonly config: MilkyHttpHandler.Config) {
  }

  start() {
    this.app = new Hono()

    this.app.use(`${this.config.prefix}/api/*`,
      cors(),
      async (c, next) => {
        if (!c.req.header('Content-Type')?.includes('application/json')) {
          this.ctx.logger.warn(
            'MilkyHttp',
            `${c.req.path} (Content-Type not application/json)`
          )
          c.status(415)
          return c.json(Failed(-415, 'Unsupported Media Type'))
        }

        await next()
      }
    )

    // Access token middleware for API routes
    if (this.config.accessToken) {
      this.app.post(`${this.config.prefix}/api/*`, async (c, next) => {
        const authorization = c.req.header('Authorization')
        if (!authorization || !authorization.startsWith('Bearer ')) {
          this.ctx.logger.warn('MilkyHttp', `${c.req.path} (Credentials missing)`)
          c.status(401)
          return c.json(Failed(-401, 'Unauthorized'))
        }

        const inputToken = authorization.slice(7)
        if (inputToken !== this.config.accessToken) {
          this.ctx.logger.warn('MilkyHttp', `${c.req.path} (Credentials wrong)`)
          c.status(401)
          return c.json(Failed(-401, 'Unauthorized'))
        }

        await next()
      })
    }

    // API endpoint
    this.app.post(`${this.config.prefix}/api/:endpoint`, async (c) => {
      const endpoint = c.req.param('endpoint')

      if (!this.milkyAdapter.apiCollection.hasApi(endpoint)) {
        this.ctx.logger.warn('MilkyHttp', `${c.req.path} (API not found)`)
        c.status(404)
        return c.json(Failed(404, 'API not found'))
      }

      const start = Date.now()
      const payload = await c.req.json()
      const response = await this.milkyAdapter.apiCollection.handle(endpoint, payload)
      const end = Date.now()
      this.ctx.logger.info(
        'MilkyHttp',
        `${c.req.path} (${response.retcode === 0 ? 'OK' : response.retcode
        } ${end - start}ms)`,
        payload
      )
      return c.json(response)
    })

    // TODO: 待 https://github.com/honojs/middleware/pull/1808 通过后，将 maxPayload 指定为 constants.MAX_STRING_LENGTH
    // 默认的 maxPayload 为 100 MiB
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: this.app })

    this.app.get(`${this.config.prefix}/event`,
      upgradeWebSocket((c) => {
        return {
          onOpen: (event, ws) => {
            if (this.config.accessToken) {
              const inputToken = this.extractToken(c.req.header(), c.req.query())
              if (!this.validateToken(inputToken)) {
                this.ctx.logger.warn('MilkyHttp', `${c.req.path} WS (Credentials invalid)`)
                return ws.close(1008, 'Unauthorized')
              }
            }

            this.eventPushClients.add(ws)
            this.ctx.logger.info('MilkyHttp', `${c.req.path} WS (Connected)`)
          },
          onClose: (event, ws) => {
            this.eventPushClients.delete(ws)
            this.ctx.logger.info('MilkyHttp', `${c.req.path} WS (Disconnected)`)
          }
        }
      }, {
        onError: (error) => {
          this.ctx.logger.warn('MilkyHttp', `WebSocket error: ${(error as Error).message}`)
        }
      }),
      cors(),
      async (c) => {
        if (this.config.accessToken) {
          const inputToken = this.extractToken(c.req.header(), c.req.query())
          if (!this.validateToken(inputToken)) {
            this.ctx.logger.warn('MilkyHttp', `${c.req.path} SSE (Credentials invalid)`)
            c.status(401)
            return c.json(Failed(-401, 'Unauthorized'))
          }
        }

        return streamSSE(c, async (stream) => {
          this.sseClients.add(stream)
          this.ctx.logger.info('MilkyHttp', `${c.req.path} SSE (Connected)`)
          stream.onAbort(() => {
            this.sseClients.delete(stream)
            this.ctx.logger.info('MilkyHttp', `${c.req.path} SSE (Disconnected)`)
          })
          return new Promise((resolve) => {
            stream.onAbort(resolve)
          })
        })
      }
    )

    this.httpServer = serve({
      fetch: this.app.fetch,
      port: this.config.port,
      hostname: this.config.host
    })
    injectWebSocket(this.httpServer)
    const displayHost = this.config.host || '0.0.0.0'
    this.ctx.logger.info(
      'MilkyHttp',
      `HTTP server started at ${displayHost}:${this.config.port}${this.config.prefix}`
    )
  }

  stop() {
    // Close all SSE connections
    for (const stream of this.sseClients) {
      stream.abort()
    }
    this.sseClients.clear()

    // Close all WS connections
    for (const ws of this.eventPushClients) {
      ws.close()
    }
    this.eventPushClients.clear()

    this.httpServer?.close()
    this.app = undefined
  }

  broadcast(msg: string) {
    // Broadcast to WebSocket clients
    for (const ws of this.eventPushClients) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg)
        }
      } catch (e) {
        this.ctx.logger.warn('MilkyHttp', `Failed to send WebSocket message: ${e}`)
      }
    }

    // Broadcast to SSE clients
    for (const stream of this.sseClients) {
      try {
        stream.writeSSE({ data: msg })
      } catch (e) {
        this.ctx.logger.warn('MilkyHttp', `Failed to send SSE message: ${e}`)
        this.sseClients.delete(stream)
      }
    }
  }

  updateConfig(config: Partial<MilkyHttpHandler.Config>) {
    Object.assign(this.config, config)
  }
}

namespace MilkyHttpHandler {
  export interface Config extends MilkyHttpConfig {
  }
}

export { MilkyHttpHandler }
