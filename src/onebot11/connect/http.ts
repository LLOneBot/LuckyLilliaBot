import http from 'node:http'
import cors from 'cors'
import crypto from 'node:crypto'
import net from 'node:net'
import express, { Express, Request, Response, NextFunction } from 'express'
import { BaseAction } from '../action/BaseAction'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { OB11Response } from '../action/OB11Response'
import { OB11BaseEvent } from '../event/OB11BaseEvent'
import { handleQuickOperation, QuickOperationEvent } from '../helper/quickOperation'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { Dict } from 'cosmokit'
import { HttpConnectConfig, HttpPostConnectConfig } from '@/common/types'
import { OB11Message } from '../types'

class OB11Http {
  private readonly expressAPP: Express
  private server?: http.Server
  private sseClients: Response[] = []
  private sockets: Set<net.Socket> = new Set()
  private activated: boolean = false

  constructor(protected ctx: Context, public config: OB11Http.Config) {
    this.expressAPP = express()
  }

  public start() {
    if (this.server || !this.config.enable) {
      return
    }
    try {
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
            this.ctx.logger.error('Error parsing JSON:', err)
            return res.status(400).send('Invalid JSON')
          }
          next()
        })
      })
      this.expressAPP.use((req, res, next) => this.authorize(req, res, next))
      this.expressAPP.use((req, res, next) => this.handleRequest(req, res, next))
      this.expressAPP.get('/', (req: Request, res: Response) => {
        res.send(`LLTwoBot server 已启动`)
      })
      const host = this.config.onlyLocalhost ? '127.0.0.1' : ''
      this.expressAPP.get('/_events', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()
        this.sseClients.push(res)

        // 添加客户端断开连接时的清理逻辑
        req.on('close', () => {
          const index = this.sseClients.indexOf(res)
          if (index > -1) {
            this.sseClients.splice(index, 1)
          }
        })

        req.on('error', () => {
          const index = this.sseClients.indexOf(res)
          if (index > -1) {
            this.sseClients.splice(index, 1)
          }
        })
      })
      this.ctx.logger.info(`OneBot V11 HTTP SSE started ${host}:${this.config.port}/_events`)
      try {
        this.server = this.expressAPP.listen(this.config.port, host, (err) => {
          if (err) {
            this.ctx.logger.error('OneBot V11 HTTP server start error:', err)
          }
          this.ctx.logger.info(`OneBot V11 HTTP server started ${host}:${this.config.port}`)
        })
        // 追踪所有 socket 连接
        this.server.on('connection', (socket: net.Socket) => {
          this.sockets.add(socket)
          socket.on('close', () => this.sockets.delete(socket))
        })
      } catch (e) {
        this.ctx.logger.error(`OneBot V11 HTTP server error ${host}:${this.config.port}`, e)
      }
      this.activated = true
    } catch (e) {
      this.ctx.logger.error('OneBot V11 HTTP服务启动失败', e)
    }
  }

  public stop() {
    return new Promise<boolean>((resolve) => {
      if (this.server) {
        this.ctx.logger.info('OneBot V11 HTTP Server closing...')
        // 主动销毁所有 socket
        for (const socket of this.sockets) {
          socket.destroy()
        }
        this.sockets.clear()
        this.server.close((err) => {
          if (err) {
            this.ctx.logger.error(`OneBot V11 HTTP Server closing ${err}`)
            this.server = undefined
            return resolve(false)
          }
          this.ctx.logger.info('OneBot V11 HTTP Server closed')
          this.server = undefined
          resolve(true)
        })
      } else {
        resolve(true)
      }
      this.activated = false
    })
  }

  public async emitEvent(event: OB11BaseEvent) {
    if (!this.activated) return
    if (this.sseClients.length === 0) {
      return
    }
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.sseClients) {
      if (!client.closed) {
        client.write(data)
        if ('post_type' in event) {
          const eventName = event.getSummaryEventName()
          this.ctx.logger.info('OneBot V11 HTTP SSE 事件上报', eventName)
        }
      }
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
    if (req.path === '/_events') {
      return next()
    }
    let payload = req.body
    if (req.method === 'GET') {
      payload = req.query
    } else if (req.query) {
      payload = { ...req.query, ...req.body }
    }
    this.ctx.logger.info('收到 HTTP 请求', req.url, payload)
    const actionName = req.path.replaceAll('/', '')
    const action = this.config.actionMap.get(actionName)
    if (action) {
      res.json(await action.handle(payload, {
        messageFormat: this.config.messageFormat,
        debug: this.config.debug
      }))
    } else {
      res.status(404).json(OB11Response.error(`${actionName} API 不存在`, 404))
    }
  }
}

namespace OB11Http {
  export interface Config extends HttpConnectConfig {
    actionMap: Map<string, BaseAction<unknown, unknown>>
    onlyLocalhost: boolean
  }
}

class OB11HttpPost {
  private disposeInterval?: () => void
  private activated: boolean = false

  constructor(protected ctx: Context, public config: OB11HttpPost.Config) {
  }

  public start() {
    this.activated = this.config.enable
    if (this.config.enableHeart && !this.disposeInterval) {
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
    if (!this.activated || !this.config.url) {
      return
    }
    const msgStr = JSON.stringify(event)
    const headers: Dict = {
      'Content-Type': 'application/json',
      'x-self-id': selfInfo.uin,
    }
    if (this.config.token) {
      const hmac = crypto.createHmac('sha1', this.config.token)
      hmac.update(msgStr)
      const sig = hmac.digest('hex')
      headers['x-signature'] = 'sha1=' + sig
    }
    const host = this.config.url
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
          this.ctx.logger.warn(`HTTP 事件上报返回数据解析失败: ${host}`, e)
        }
      },
      (err) => {
        this.ctx.logger.error(`HTTP 事件上报失败: ${host}`, err, event)
      },
    ).catch(e => {
      this.ctx.logger.error(`HTTP 事件上报过程中发生异常: ${host}`, e)
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

  public updateConfig(config: Partial<OB11HttpPost.Config>) {
    Object.assign(this.config, config)
  }
}

namespace OB11HttpPost {
  export interface Config extends HttpPostConnectConfig { }
}

export { OB11Http, OB11HttpPost }

