import path from 'path'
import { Config, WebUIConfig } from '@/common/types'
import { Context, Service } from 'cordis'
import { TEMP_DIR } from '@/common/globalVars'
import { getAvailablePort } from '@/common/utils/port'
import { ChatType, RawMessage } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { existsSync, mkdirSync } from 'node:fs'
import { authMiddleware } from './auth'
import { serializeResult } from './utils'
import {
  createConfigRoutes,
  createAuthTokenRoutes,
  createDashboardRoutes,
  createLoginRoutes,
  createLogsRoutes,
  createWebQQRoutes,
  createEmailRoutes
} from './routes'
import { Msg } from '@/ntqqapi/proto'
import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { SSEStreamingApi } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve, ServerType } from '@hono/node-server'
import { noop } from 'cosmokit'

// 静态文件服务，指向前端dist目录
let feDistPath = path.resolve(import.meta.dirname, 'webui/')
// @ts-expect-error: TS2339 - Property 'env' does not exist on type 'ImportMeta'
if (!import.meta.env) {
  feDistPath = path.join(import.meta.dirname, '../../../dist/webui/')
}

declare module 'cordis' {
  interface Context {
    webuiServer: WebuiServer
  }
}

// WebuiServer 只 inject 了登录前就绪的 qqProtocol/ntLoginApi (见下方 static inject 注释), 但 dashboard/
// webqq 等登录后的路由要用 nt* / store / config / ntSystemApi 等服务, 它们依赖 store->database, 登录后才
// 加载. cordis 严格模式下直接 ctx.ntGroupApi 会抛 "cannot get property without inject". 这里包一层代理:
//   - 服务名 (LAZY_SERVICES) 走 ctx.get(name) 绕过严格检查 (未就绪返 undefined, 登录后路由被调时已就绪)
//   - 其余内建成员 (logger/on/parallel/get 等) 透传, 且把函数绑回真 ctx, 避免 this 指向代理破坏 cordis 内部
// 好处: 路由里 ctx.ntGroupApi.xxx 的写法和类型都不用动, 只在 server.ts 注册处包一次.
const LAZY_SERVICES = new Set([
  'ntGroupApi', 'ntUserApi', 'ntMsgApi', 'ntFileApi', 'ntFriendApi', 'ntSystemApi', 'ntWebApi',
  'store', 'config', 'app', 'emailNotification',
])

function lazyServiceContext(ctx: Context): Context {
  return new Proxy(ctx, {
    get(target, prop) {
      if (typeof prop === 'string' && LAZY_SERVICES.has(prop)) {
        return (target as unknown as { get(n: string): unknown }).get(prop)
      }
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    },
  }) as Context
}

export interface WebuiServerConfig extends WebUIConfig {
}

export class WebuiServer extends Service {
  // 登录前 WebUI 也要能起 (要给用户看/输 auth_token / 扫码), 所以只把登录前就能 ready 的依赖标 required.
  // 其余 nt* API 依赖 store, 而 store 又依赖 database, database 只在 loadPluginAfterLogin 才加载;
  // 若列进 inject 会一直卡到登录成功才启动. cordis object-form inject 里 value 无论 true/false
  // 都算 required, 所以真正 optional 的依赖必须从 inject 里彻底移除, handler 里按需 ctx.get(...) 拿.
  static inject = ['qqProtocol', 'ntLoginApi']

  private server: ServerType | null = null
  private app: Hono = new Hono()
  private currentPort?: number
  public port?: number = undefined
  private sseClients: Set<SSEStreamingApi> = new Set()
  private uploadDir: string

  async [Service.init]() {
    await this.start()
    return noop
  }

  constructor(ctx: Context, public config: WebuiServerConfig) {
    super(ctx, 'webuiServer')
    this.uploadDir = path.join(TEMP_DIR, 'webqq-uploads')
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true })
    }
    this.initServer()
    this.setupMessageListener()
    this.setupConfigListener()
  }

  private setupConfigListener() {
    this.ctx.on('llob/config-updated', (newConfig: Config) => {
      const oldConfig = { ...this.config }
      this.setConfig(newConfig)
      const forcePort = (oldConfig.port === newConfig.webui?.port) ? this.currentPort : undefined
      if (oldConfig.host != newConfig.webui?.host
        || oldConfig.enable != newConfig.webui?.enable
        || oldConfig.port != newConfig.webui?.port
      ) {
        this.ctx.logger.info('WebUI 配置已更新:', this.config)
        setTimeout(() => this.restart(forcePort), 1000)
      }
    })
  }

  private initServer() {
    this.app.use('/api/*', authMiddleware)

    // 用懒服务代理 ctx: 登录后才就绪的 nt*/store/config 等服务在路由里直接 ctx.xxx 访问不再抛 without-inject
    const ctx = lazyServiceContext(this.ctx)

    // 注册路由
    this.app.route('/api', createConfigRoutes(ctx))
    this.app.route('/api', createAuthTokenRoutes())
    this.app.route('/api', createLoginRoutes(ctx))
    this.app.route('/api', createDashboardRoutes(ctx))
    this.app.route('/api', createLogsRoutes(ctx))
    this.app.route('/api/email', createEmailRoutes(ctx))
    this.app.route('/api/webqq', createWebQQRoutes(ctx, {
      uploadDir: this.uploadDir,
      sseClients: this.sseClients,
      createPicElement: this.createPicElement.bind(this)
    }))

    // 静态文件服务
    this.app.use('/*', serveStatic({ root: feDistPath }))
    this.app.get('/', async (c) => {
      const filePath = path.join(feDistPath, 'index.html')
      return c.html((await readFile(filePath)).toString())
    })
  }

  private async createPicElement(imagePath: string) {
    try {
      return await SendElement.pic(this.ctx, imagePath)
    } catch (e) {
      this.ctx.logger.error('创建图片元素失败:', e)
      return null
    }
  }

  public broadcastMessage(event: string, data: unknown) {
    const serializedData = serializeResult(data)
    const message = `event: ${event}\ndata: ${JSON.stringify(serializedData)}\n\n`
    for (const client of this.sseClients) {
      client.write(message)
    }
  }

  private setupMessageListener() {
    // 收到的消息 (别人发 / 自己在其它客户端发).
    this.ctx.on('nt/message-created', async (data) => {
      if (this.sseClients.size === 0) return
      await this.fillPeerUin(data.message)
      this.broadcastMessage('message', { type: 'message-created', data: data.message })
    })

    // 自己通过 WebQQ (或 ntMsgApi.sendMsg 任何调用方) 发的消息.
    // 没这条 SSE, FE ChatInput 发完会 onTempMessageRemove 把临时消息清掉但等不到真消息回填 -> 界面空白.
    this.ctx.on('nt/message-sent', async (data) => {
      if (this.sseClients.size === 0) return
      await this.fillPeerUin(data.message)
      this.broadcastMessage('message', { type: 'message-sent', data: data.message })
    })

    // 监听消息撤回事件
    this.ctx.on('nt/message-deleted', async (data) => {
      if (this.sseClients.size === 0) return
      this.broadcastMessage('message', {
        type: 'message-deleted',
        data: {
          msgId: data.msgId,
          msgSeq: data.msgSeq.toString(),
          chatType: data.chatType,
          peerUid: data.peerUid,
          peerUin: data.peerUin.toString(),
          operatorUid: data.operatorUid,
          operatorNick: '',
          isSelfOperate: data.senderUin === data.operatorUin,
          wording: data.displaySuffix
        }
      })
    })

    // 表情回应事件 (群消息被贴表情). 转成 emoji-reaction SSE 推给 FE 实时更新气泡下方的表情.
    this.ctx.on('nt/group-message-reaction', async (data) => {
      if (this.sseClients.size === 0) return
      let userName = ''
      try {
        userName = (await this.ctx.store.getGroupMemberCardName(data.groupCode, data.operatorUin)) || ''
      } catch { /* 查不到名字就留空, 不影响表情显示 */ }
      this.broadcastMessage('message', {
        type: 'emoji-reaction',
        data: {
          groupCode: data.groupCode.toString(),
          msgSeq: data.msgSeq.toString(),
          emojiId: data.faceId.toString(),
          userId: data.operatorUin.toString(),
          userName,
          isAdd: data.isAdd,
        }
      })
    })

    // TODO: 监听群通知事件（加群申请、邀请入群、被踢等）

    // TODO: 监听好友申请事件

    // TODO: 监听群解散事件

    // TODO: 监听主动退群事件（可能并没有这个事件）
  }

  private async fillPeerUin(message: RawMessage) {
    if (message.chatType === ChatType.C2C && (!message.peerUin || message.peerUin === 0) && message.peerUid) {
      // ntUserApi 未 inject (登录后才就绪), 用 ctx.get 绕过严格检查
      const ntUserApi = this.ctx.get('ntUserApi' as never) as Context['ntUserApi'] | undefined
      const uin = await ntUserApi?.getUinByUid(message.peerUid)
      if (uin) {
        message.peerUin = uin
      }
    }
  }

  private getHostPort(): { host: string; port: number } {
    return { host: this.config.host, port: this.config.port }
  }

  private async startServer(forcePort?: number) {
    const { host, port } = this.getHostPort()
    const targetPort = forcePort !== undefined ? forcePort : await getAvailablePort(port)
    this.server = serve({
      fetch: this.app.fetch,
      port: targetPort,
      hostname: host
    }, () => {
      this.currentPort = targetPort
      const displayHost = host || '0.0.0.0'
      this.ctx.logger.info(`Webui 服务器已启动 ${displayHost}:${targetPort}`)
    })
    return targetPort
  }

  stop() {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            this.ctx.logger.error(`Webui 停止时出错:`, err)
          } else {
            this.ctx.logger.info(`Webui 服务器已停止`)
          }
          this.server = null
          resolve()
        })
      } else {
        this.ctx.logger.info(`Webui 服务器未运行`)
        resolve()
      }
    })
  }

  async restart(forcePort?: number) {
    await this.stop()
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.startWithPort(forcePort)
  }

  public setConfig(newConfig: Config) {
    this.config = newConfig.webui
  }

  async start() {
    if (!this.config?.enable) {
      return
    }
    this.port = await this.startServer()
  }

  private async startWithPort(forcePort?: number): Promise<void> {
    if (!this.config?.enable) {
      return
    }
    this.port = await this.startServer(forcePort)
  }
}
