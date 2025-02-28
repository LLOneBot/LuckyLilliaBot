import http from 'node:http'
import cors from 'cors'
import crypto from 'node:crypto'
import express, { Express, Request, Response, NextFunction } from 'express'
import { BaseAction } from '../action/BaseAction'
import { Context } from 'cordis'
import { llonebotError, selfInfo } from '@/common/globalVars'
import { OB11Response } from '../action/OB11Response'
import { OB11BaseEvent } from '../event/OB11BaseEvent'
import { handleQuickOperation, QuickOperationEvent } from '../helper/quickOperation'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { Dict } from 'cosmokit'

class OB11Http {
  private readonly expressAPP: Express
  private server?: http.Server
  private sseClients: Response[] = []

  constructor(protected ctx: Context, public config: OB11Http.Config) {
    this.expressAPP = express()
    // 添加 CORS 中间件
    this.expressAPP.use(cors())
    this.expressAPP.use(express.urlencoded({ extended: true, limit: '5000mb' }))
    this.expressAPP.use((req, res, next) => {
      // 兼容处理没有带content-type的请求
      req.headers['content-type'] = 'application/json'
      const originalJson = express.json({ limit: '5000mb' })
      // 调用原始的express.json()处理器
      originalJson(req, res, (err) => {
        if (err) {
          ctx.logger.error('Error parsing JSON:', err)
          return res.status(400).send('Invalid JSON')
        }
        next()
      })
    })
    this.expressAPP.use((req, res, next) => this.authorize(req, res, next))
    this.expressAPP.use((req, res, next) => this.handleRequest(req, res, next))
  }

  public start() {
    if (this.server) return
    try {
      this.expressAPP.get('/', (req: Request, res: Response) => {
        res.send(`LLOneBot server 已启动`)
      })
      const host = this.config.listenLocalhost ? '127.0.0.1' : '0.0.0.0'
      this.server = this.expressAPP.listen(this.config.port, host, () => {
        this.ctx.logger.info(`HTTP server started ${host}:${this.config.port}`)
      })
      llonebotError.httpServerError = ''
      this.expressAPP.get('/_events', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()
        this.sseClients.push(res)
      })
      this.ctx.logger.info(`HTTP SSE started ${host}:${this.config.port}/_events`)
    } catch (e) {
      this.ctx.logger.error('HTTP服务启动失败', e)
      llonebotError.httpServerError = 'HTTP服务启动失败, ' + e
    }
  }

  public stop() {
    return new Promise<boolean>((resolve) => {
      llonebotError.httpServerError = ''
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            return resolve(false)
          }
          resolve(true)
        })
        this.server = undefined
      } else {
        resolve(true)
      }
    })
  }

  public async emitEvent(event: OB11BaseEvent) {
    if (this.sseClients.length === 0) {
      return
    }
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.sseClients) {
      if (!client.closed) {
        client.write(data)
        if ('post_type' in event) {
          const eventName = event.post_type + '.' + event[event.post_type + '_type']
          this.ctx.logger.info('HTTP SSE 事件上报', eventName)
        }
      }
    }
  }

  public updateConfig(config: Partial<OB11Http.Config>) {
    Object.assign(this.config, config)
  }

  private authorize(req: Request, res: Response, next: NextFunction) {
    const serverToken = this.config.token
    if (!serverToken) return next()

    let clientToken = ''
    const authHeader = req.get('authorization')
    if (authHeader) {
      clientToken = authHeader.split('Bearer ').pop()!
      this.ctx.logger.info('receive http header token', clientToken)
    } else if (req.query.access_token) {
      if (Array.isArray(req.query.access_token)) {
        clientToken = req.query.access_token[0].toString()
      } else {
        clientToken = req.query.access_token.toString()
      }
      this.ctx.logger.info('receive http url token', clientToken)
    }

    if (clientToken !== serverToken) {
      res.status(403).json({ message: 'token verify failed!' })
    } else {
      next()
    }
  }

  private async handleRequest(req: Request, res: Response, next: NextFunction) {
    if (req.path === '/') {
      return next()
    }
    if (this.config.enableHttpSse && req.path === '/_events') {
      return next()
    }
    let payload = req.body
    if (req.method === 'GET') {
      payload = req.query
    } else if (req.query) {
      payload = { ...req.query, ...req.body }
    }
    this.ctx.logger.info('收到 HTTP 请求', req.url, payload)
    const action = this.config.actionMap.get(req.path.replaceAll('/', ''))
    if (action) {
      res.json(await action.handle(payload))
    } else {
      res.status(404).json(OB11Response.error('API 不存在', 404))
    }
  }
}

namespace OB11Http {
  export interface Config {
    port: number
    token?: string
    actionMap: Map<string, BaseAction<unknown, unknown>>
    listenLocalhost: boolean
    enableHttpSse?: boolean
  }
}

class OB11HttpPost {
  private disposeInterval?: () => void
  private activated = false

  constructor(protected ctx: Context, public config: OB11HttpPost.Config) {
  }

  public start() {
    this.activated = true
    if (this.config.enableHttpHeart && !this.disposeInterval) {
      this.disposeInterval = this.ctx.setInterval(() => {
        // ws的心跳是ws自己维护的
        this.emitEvent(new OB11HeartbeatEvent(selfInfo.online!, true, this.config.heartInterval))
      }, this.config.heartInterval)
    }
  }

  public stop() {
    this.activated = false
    this.disposeInterval?.()
  }

  public async emitEvent(event: OB11BaseEvent) {
    if (!this.activated || !this.config.hosts.length) {
      return
    }
    const msgStr = JSON.stringify(event)
    const headers: Dict = {
      'Content-Type': 'application/json',
      'x-self-id': selfInfo.uin,
    }
    if (this.config.secret) {
      const hmac = crypto.createHmac('sha1', this.config.secret)
      hmac.update(msgStr)
      const sig = hmac.digest('hex')
      headers['x-signature'] = 'sha1=' + sig
    }
    for (const host of this.config.hosts) {
      fetch(host, {
        method: 'POST',
        headers,
        body: msgStr,
      }).then(
        async (res) => {
          if (event.post_type) {
            const eventName = event.post_type + '.' + event[event.post_type + '_type']
            this.ctx.logger.info(`HTTP 事件上报: ${host}`, eventName, res.status)
          }
          try {
            const resJson = await res.json()
            this.ctx.logger.info(`HTTP 事件上报后返回快速操作:`, JSON.stringify(resJson))
            handleQuickOperation(this.ctx, event as QuickOperationEvent, resJson).catch(e => this.ctx.logger.error(e))
          } catch (e) {
            //log(`新消息事件HTTP上报没有返回快速操作，不需要处理`)
          }
        },
        (err) => {
          this.ctx.logger.error(`HTTP 事件上报失败: ${host}`, err, event)
        },
      ).catch(e => this.ctx.logger.error(e))
    }
  }

  public updateConfig(config: Partial<OB11HttpPost.Config>) {
    Object.assign(this.config, config)
  }
}

namespace OB11HttpPost {
  export interface Config {
    hosts: string[]
    secret?: string
    enableHttpHeart?: boolean
    heartInterval: number
  }
}

export { OB11Http, OB11HttpPost }
