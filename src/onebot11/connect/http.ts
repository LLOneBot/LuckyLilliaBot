import BaseAction from '../action/BaseAction'
import http from 'node:http'
import cors from 'cors'
import crypto from 'node:crypto'
import express, { Express, Request, Response } from 'express'
import { Context } from 'cordis'
import { llonebotError, selfInfo } from '@/common/globalVars'
import { OB11Response } from '../action/OB11Response'
import { OB11Message } from '../types'
import { OB11BaseEvent } from '../event/OB11BaseEvent'
import { handleQuickOperation, QuickOperationEvent } from '../helper/quickOperation'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { Dict } from 'cosmokit'

type RegisterHandler = (res: Response, payload: unknown) => Promise<unknown>

class OB11Http {
  private readonly expressAPP: Express
  private server?: http.Server

  constructor(protected ctx: Context, public config: OB11Http.Config) {
    this.expressAPP = express()
    // 添加 CORS 中间件
    this.expressAPP.use(cors())
    this.expressAPP.use(express.urlencoded({ extended: true, limit: '5000mb' }))
    this.expressAPP.use((req, res, next) => {
      // 兼容处理没有带content-type的请求
      // log("req.headers['content-type']", req.headers['content-type'])
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
    setTimeout(() => {
      for (const [actionName, action] of config.actionMap) {
        this.registerRouter('post', actionName, (res, payload) => action.handle(payload))
        this.registerRouter('get', actionName, (res, payload) => action.handle(payload))
      }
    }, 0)
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

  public updateConfig(config: Partial<OB11Http.Config>) {
    Object.assign(this.config, config)
  }

  private authorize(req: Request, res: Response, next: () => void) {
    const serverToken = this.config.token
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

    if (serverToken && clientToken !== serverToken) {
      return res.status(403).send(JSON.stringify({ message: 'token verify failed!' }))
    }
    next()
  }

  private registerRouter(method: 'post' | 'get', url: string, handler: RegisterHandler) {
    if (!url.startsWith('/')) {
      url = '/' + url
    }

    if (!this.expressAPP[method]) {
      const err = `LLOneBot server register router failed，${method} not exist`
      this.ctx.logger.error(err)
      throw err
    }
    this.expressAPP[method](url, this.authorize.bind(this), async (req: Request, res: Response) => {
      let payload = req.body
      if (method == 'get') {
        payload = req.query
      } else if (req.query) {
        payload = { ...req.query, ...req.body }
      }
      this.ctx.logger.info('收到 HTTP 请求', url, payload)
      try {
        res.send(await handler(res, payload))
      } catch (e) {
        res.send(OB11Response.error((e as Error).stack!.toString(), 200))
      }
    })
  }
}

namespace OB11Http {
  export interface Config {
    port: number
    token?: string
    actionMap: Map<string, BaseAction<unknown, unknown>>
    listenLocalhost: boolean
  }
}

class OB11HttpPost {
  private disposeInterval?: () => void

  constructor(protected ctx: Context, public config: OB11HttpPost.Config) {
  }

  public start() {
    if (this.config.enableHttpHeart && !this.disposeInterval) {
      this.disposeInterval = this.ctx.setInterval(() => {
        // ws的心跳是ws自己维护的
        this.emitEvent(new OB11HeartbeatEvent(selfInfo.online!, true, this.config.heartInterval))
      }, this.config.heartInterval)
    }
  }

  public stop() {
    this.disposeInterval?.()
  }

  public async emitEvent(event: OB11BaseEvent | OB11Message) {
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
            this.ctx.logger.info(`HTTP 事件上报: ${host}`, event.post_type, res.status)
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