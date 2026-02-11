import { MilkyHttpConfig } from '@/common/types'
import type { MilkyAdapter } from '@/milky/adapter'
import { Failed } from '@/milky/common/api'
import express, { Express, Response } from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import cors from 'cors'
import { Context } from 'cordis'

class MilkyHttpHandler {
  readonly eventPushClients = new Set<WebSocket>()
  readonly sseClients = new Set<Response>()
  private app: Express | undefined
  private httpServer: http.Server | undefined
  private wsServer: WebSocketServer | undefined

  /**
   * Extract token from Authorization header or query parameter
   */
  private extractToken(headers: http.IncomingHttpHeaders, query?: Record<string, unknown>): string {
    const authHeader = headers['authorization']
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim()
    }
    return (query?.['access_token'] as string) ?? ''
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
    this.app = express()

    this.app.use(cors())
    this.app.use(express.json({ limit: '1024mb' }))

    // Access token middleware for API routes
    if (this.config.accessToken) {
      this.app.use(`${this.config.prefix}/api`, (req, res, next) => {
        if (!req.headers['content-type']?.includes('application/json')) {
          this.ctx.logger.warn(
            'MilkyHttp',
            `${req.ip} -> ${req.path} (Content-Type not application/json)`
          )
          return res.status(415).json(Failed(-415, 'Unsupported Media Type'))
        }

        const authorization = req.headers['authorization']
        if (!authorization || !authorization.startsWith('Bearer ')) {
          this.ctx.logger.warn('MilkyHttp', `${req.ip} -> ${req.path} (Credentials missing)`)
          return res.status(401).json(Failed(-401, 'Unauthorized'))
        }
        const inputToken = authorization.slice(7)

        if (inputToken !== this.config.accessToken) {
          this.ctx.logger.warn('MilkyHttp', `${req.ip} -> ${req.path} (Credentials wrong)`)
          return res.status(401).json(Failed(-401, 'Unauthorized'))
        }

        next()
      })
    }

    // API endpoint
    this.app.post(`${this.config.prefix}/api/:endpoint`, async (req, res) => {
      const endpoint = req.params.endpoint
      const payload = req.body

      if (!this.milkyAdapter.apiCollection.hasApi(endpoint)) {
        this.ctx.logger.warn('MilkyHttp', `${req.ip} -> ${req.path} (API not found)`)
        return res.status(404).json(Failed(404, 'API not found'))
      }

      const start = Date.now()
      const response = await this.milkyAdapter.apiCollection.handle(endpoint, payload)
      const end = Date.now()
      this.ctx.logger.info(
        'MilkyHttp',
        `${req.ip} -> ${req.path} (${response.retcode === 0 ? 'OK' : response.retcode
        } ${end - start}ms)`,
        payload
      )
      return res.json(response)
    })

    // SSE event endpoint
    this.app.get('/event', (req, res) => {
      // Check access token for SSE connection
      if (this.config.accessToken) {
        const inputToken = this.extractToken(req.headers, req.query as Record<string, unknown>)
        if (!this.validateToken(inputToken)) {
          this.ctx.logger.warn('MilkyHttp', `${req.ip} -> /event SSE (Credentials invalid)`)
          return res.status(401).json(Failed(-401, 'Unauthorized'))
        }
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      this.sseClients.add(res)
      this.ctx.logger.info('MilkyHttp', `${req.ip} -> /event SSE (Connected)`)

      req.on('close', () => {
        this.sseClients.delete(res)
        this.ctx.logger.info('MilkyHttp', `${req.ip} -> /event SSE (Disconnected)`)
      })
    })

    this.httpServer = this.app.listen(this.config.port, this.config.host, () => {
      const displayHost = this.config.host || '0.0.0.0'
      this.ctx.logger.info(
        'MilkyHttp',
        `HTTP server started at http://${displayHost}:${this.config.port}${this.config.prefix}`
      )
    })

    // Setup WebSocket server for event push
    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: `${this.config.prefix}/event`,
      maxPayload: 1024 * 1024 * 1024
    })

    this.wsServer.on('connection', (ws, req) => {
      // Check access token for WebSocket connection
      if (this.config.accessToken) {
        const url = new URL(req.url!, `http://${req.headers.host}`)
        const query = Object.fromEntries(url.searchParams.entries())
        const inputToken = this.extractToken(req.headers, query)

        if (!this.validateToken(inputToken)) {
          this.ctx.logger.warn('MilkyHttp', `${req.socket.remoteAddress} -> /event WS (Credentials invalid)`)
          ws.close(1008, 'Unauthorized')
          return
        }
      }

      this.eventPushClients.add(ws)
      this.ctx.logger.info('MilkyHttp', `${req.socket.remoteAddress} -> /event (Connected)`)

      ws.on('close', () => {
        this.eventPushClients.delete(ws)
        this.ctx.logger.info('MilkyHttp', `${req.socket.remoteAddress} -> /event (Disconnected)`)
      })

      ws.on('error', (error) => {
        this.ctx.logger.warn('MilkyHttp', `WebSocket error: ${error.message}`)
        this.eventPushClients.delete(ws)
      })
    })
  }

  stop() {
    // Close all SSE connections
    for (const res of this.sseClients) {
      res.end()
    }
    this.sseClients.clear()

    this.wsServer?.close()
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
    for (const res of this.sseClients) {
      try {
        res.write(`data: ${msg}\n\n`)
      } catch (e) {
        this.ctx.logger.warn('MilkyHttp', `Failed to send SSE message: ${e}`)
        this.sseClients.delete(res)
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
