import crypto from 'node:crypto'
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
import { postHttpEvent } from '../helper/eventForHttp'
import { Hono, Context as HonoContext, Next } from 'hono'
import { cors } from 'hono/cors'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { serve, ServerType } from '@hono/node-server'

class OB11Http {
  private app?: Hono
  private server?: ServerType
  private sseClients: Set<SSEStreamingApi> = new Set()
  private activated: boolean = false

  constructor(protected ctx: Context, public config: OB11Http.Config) {
  }

  public start() {
    if (this.server || !this.config.enable) {
      return
    }
    this.app = new Hono()

    this.app.use(`/*`, cors())

    this.app.use('/*', this.authorize.bind(this))

    this.app.get('/_events', async (c) => {
      return streamSSE(c, async (stream) => {
        this.sseClients.add(stream)
        stream.onAbort(() => {
          this.sseClients.delete(stream)
        })
        return new Promise((resolve) => {
          stream.onAbort(resolve)
        })
      })
    })

    this.app.use('/:endpoint', this.handleRequest.bind(this))

    const displayHost = this.config.host || '0.0.0.0'
    this.server = serve({
      fetch: this.app.fetch,
      port: this.config.port,
      hostname: this.config.host
    }, () => {
      this.ctx.logger.info(`OneBot V11 HTTP server started ${displayHost}:${this.config.port}`)
      this.ctx.logger.info(`OneBot V11 HTTP SSE started ${displayHost}:${this.config.port}/_events`)
    })

    this.activated = true
  }

  public stop() {
    return new Promise<boolean>((resolve) => {
      if (this.server) {
        this.ctx.logger.info('OneBot V11 HTTP Server closing...')
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
      this.app = undefined
      this.activated = false
    })
  }

  public async emitEvent(event: OB11BaseEvent) {
    postHttpEvent(event)
    if (!this.activated) return
    if (this.sseClients.size === 0) {
      return
    }
    const data = JSON.stringify(event)
    for (const client of this.sseClients) {
      if (!client.closed) {
        client.writeSSE({ data })
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

  private async authorize(c: HonoContext, next: Next) {
    const serverToken = this.config.token
    if (!serverToken) return await next()

    let clientToken = ''
    const authHeader = c.req.header('Authorization')
    const authQuery = c.req.query('access_token')
    if (authHeader) {
      clientToken = authHeader.split('Bearer ').pop()!
      this.ctx.logger.info('receive http header token', clientToken)
    } else if (authQuery) {
      clientToken = authQuery
      this.ctx.logger.info('receive http url token', clientToken)
    }

    if (clientToken !== serverToken) {
      return c.json({ message: 'token verify failed' }, 403)
    } else {
      await next()
    }
  }

  private async handleRequest(c: HonoContext) {
    let payload
    if (c.req.method === 'POST') {
      if (c.req.header('Content-Type')?.includes('application/x-www-form-urlencoded')) {
        payload = await c.req.parseBody()
      } else {
        const text = await c.req.text()
        payload = text ? JSON.parse(text) : {}
      }
    } else {
      payload = c.req.query()
    }
    this.ctx.logger.info('收到 HTTP 请求', c.req.url, payload)
    const actionName = c.req.param('endpoint')!
    const action = this.config.actionMap.get(actionName)
    if (action) {
      return c.json(await action.handle(payload, {
        messageFormat: this.config.messageFormat,
        debug: this.config.debug
      }))
    } else {
      return c.json(OB11Response.error(`${actionName} API 不存在`, 404), 404)
    }
  }
}

namespace OB11Http {
  export interface Config extends HttpConnectConfig {
    actionMap: Map<string, BaseAction<unknown, unknown>>
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
        // https://docs.go-cqhttp.org/reference/#%E5%BF%AB%E9%80%9F%E6%93%8D%E4%BD%9C
        if (res.status === 204 || res.headers.get('Content-Length') === '0') {
          return
        }
        try {
          const resJson = await res.json()
          this.ctx.logger.info(`HTTP 事件上报后返回快速操作:`, resJson)
          handleQuickOperation(this.ctx, event as QuickOperationEvent, resJson).catch(e => this.ctx.logger.error(e))
        } catch (e) { }
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

