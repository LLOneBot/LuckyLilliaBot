import path from 'path'
import { Config, WebUIConfig } from '@/common/types'
import { Context, Service } from 'cordis'
import { getAvailablePort } from '@/common/utils/port'
import { authMiddleware } from './auth'
import { createBotsRoutes, createConfigRoutes, createFileRoutes } from './routes'
import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve, ServerType } from '@hono/node-server'
import { noop } from 'cosmokit'
import type { FetchHandler, WebUIServer } from '@luckylillia/plugin-sdk'

let feDistPath = path.resolve(import.meta.dirname, 'webui/')
// @ts-expect-error: TS2339 - Property 'env' does not exist on type 'ImportMeta'
if (!import.meta.env) {
  feDistPath = path.join(import.meta.dirname, '../../../../../../dist/webui/')
}

export interface WebuiServerConfig extends WebUIConfig {
}

export type MountedHandler = FetchHandler

function findMounted(table: Map<string, MountedHandler>, path: string): MountedHandler | undefined {
  for (const [prefix, handler] of table) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return handler
  }
}

// ctx.webuiServer is typed by the plugin SDK, which plugins serving their own API build against
export class WebuiServer extends Service implements WebUIServer {
  // Mounted by the core entry builtin:webui: up before any login and without the NT protocol, so the plugin page can
  // switch protocols on and off. Login, dashboard, logs, email and WebQQ are plugins that inject what they need and
  // mount their routes through route() once that is up.
  static inject = ['config']

  private server: ServerType | null = null
  private app: Hono = new Hono()
  private currentPort?: number
  public port?: number = undefined
  // Mounted at runtime by plugins; Hono has no way to unregister a route
  private mounted = new Map<string, MountedHandler>()
  private publicMounted = new Map<string, MountedHandler>()

  async [Service.init]() {
    await this.start()
    return noop
  }

  public config: WebuiServerConfig

  constructor(ctx: Context) {
    super(ctx, 'webuiServer')
    this.config = ctx.config.get().webui
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
   * Serves requests under `prefix` with `handler` until the returned disposer runs, which happens on
   * its own when the calling plugin is disposed. The handler sees the full URL: give a Hono app
   * basePath(prefix) or route(prefix, ...).
   *
   * Routes live under /api behind the WebUI login. `public` ones live outside it, for what the browser
   * requests by itself without the login header (ES module imports); they have to check access themselves.
   */
  route(prefix: string, handler: MountedHandler, options: { public?: boolean } = {}): () => void {
    const key = prefix.replace(/\/+$/, '')
    const underApi = key === '/api' || key.startsWith('/api/')
    if (underApi === !!options.public) {
      throw new Error(options.public ? `public route ${key} must not be under /api` : `route ${key} must be under /api`)
    }
    const table = options.public ? this.publicMounted : this.mounted
    return this.ctx.effect(() => {
      if (table.has(key)) throw new Error(`${key} is already mounted`)
      table.set(key, handler)
      return () => {
        table.delete(key)
      }
    }, `webuiServer.route(${key})`)
  }

  private initServer() {
    this.app.use('/api/*', authMiddleware)

    this.app.route('/api', createConfigRoutes(this.ctx))
    this.app.route('/api', createBotsRoutes(this.ctx))
    this.app.route('/api', createFileRoutes())

    // Registered after the built-in routes, so those always win
    this.app.use('/api/*', async (c) => {
      const handler = findMounted(this.mounted, c.req.path)
      if (handler) return handler.fetch(c.req.raw, c.env)
      // Also what a disabled or not yet started plugin answers, so the client gets JSON to show
      return c.json({ success: false, message: '接口不存在，或者提供它的插件未启用 / 尚未就绪' }, 404)
    })
    this.app.use('*', async (c, next) => {
      const handler = findMounted(this.publicMounted, c.req.path)
      if (handler) return handler.fetch(c.req.raw, c.env)
      await next()
    })

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
