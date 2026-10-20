import path from 'path'
import { Config, WebUIConfig } from '@/common/types'
import { Context, Service } from 'cordis'
import { getAvailablePort } from '@/common/utils/port'
import { authMiddleware } from './auth'
import {
  createConfigRoutes,
  createAuthTokenRoutes,
  createLoginRoutes,
  createLogsRoutes,
} from './routes'
import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
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

export interface WebuiServerConfig extends WebUIConfig {
}

/** Anything with a fetch-style entry point; a Hono app qualifies. */
export interface MountedHandler {
  fetch(request: Request, env?: any): Response | Promise<Response>
}

export class WebuiServer extends Service {
  // The WebUI has to be up before login (auth token, QR login), so it depends only on services ready by then and
  // serves only the routes needed by then. Dashboard, email, WebQQ and plugin management are plugins that inject
  // what they need and mount their routes through route() once that is up.
  static inject = ['qqProtocol', 'ntLoginApi', 'config']

  private server: ServerType | null = null
  private app: Hono = new Hono()
  private currentPort?: number
  public port?: number = undefined
  // Mounted at runtime by plugins; Hono has no way to unregister a route
  private mounted = new Map<string, MountedHandler>()

  async [Service.init]() {
    await this.start()
    return noop
  }

  constructor(ctx: Context, public config: WebuiServerConfig) {
    super(ctx, 'webuiServer')
    this.initServer()
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

  /**
   * Serves requests under `prefix` (behind the WebUI auth) with `handler` until the returned
   * disposer runs, which happens on its own when the calling plugin is disposed. The handler
   * sees the full URL: give a Hono app basePath(prefix) or route(prefix, ...).
   */
  route(prefix: string, handler: MountedHandler): () => void {
    const key = prefix.replace(/\/+$/, '')
    return this.ctx.effect(() => {
      if (this.mounted.has(key)) throw new Error(`${key} is already mounted`)
      this.mounted.set(key, handler)
      return () => {
        this.mounted.delete(key)
      }
    }, `webuiServer.route(${key})`)
  }

  private initServer() {
    this.app.use('/api/*', authMiddleware)

    // 注册路由
    this.app.route('/api', createConfigRoutes(this.ctx))
    this.app.route('/api', createAuthTokenRoutes())
    this.app.route('/api', createLoginRoutes(this.ctx))
    this.app.route('/api', createLogsRoutes(this.ctx))

    // Registered after the built-in routes, so those always win
    this.app.use('/api/*', async (c) => {
      const { path } = c.req
      for (const [prefix, handler] of this.mounted) {
        if (path === prefix || path.startsWith(`${prefix}/`)) return handler.fetch(c.req.raw, c.env)
      }
      // Also what a disabled or not yet started plugin answers, so the client gets JSON to show
      return c.json({ success: false, message: '接口不存在，或者提供它的插件未启用 / 尚未就绪' }, 404)
    })

    // 静态文件服务
    this.app.use('/*', serveStatic({ root: feDistPath }))
    this.app.get('/', async (c) => {
      const filePath = path.join(feDistPath, 'index.html')
      return c.html((await readFile(filePath)).toString())
    })
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
