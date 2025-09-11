import express, { Application, Express, NextFunction, Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfigUtil, WebUIEntryConfig, webuiEntryConfigUtil } from '@/common/config'
import { Config, WebUIConfig } from '@/common/types'
import { Server } from 'http'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { getAvailablePort } from '@/common/utils/port'
import { OnQRCodeLoginSucceedParameter } from '@/ntqqapi/services/NodeIKernelLoginService'
import { pmhq } from '@/ntqqapi/native/pmhq'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 静态文件服务，指向前端dist目录
let feDistPath = path.resolve(__dirname, 'webui/')
if (!import.meta.env) {
  feDistPath = path.join(__dirname, '../../../dist/webui/')
}

declare module 'cordis' {
  interface Context {
    webuiConfigServer: WebUIConfigServer
    webUIEntryServer: WebUIEntryServer
  }
}

export interface WebUIServerConfig extends WebUIConfig {
  onlyLocalhost: boolean
}

abstract class WebUIServerBase extends Service {
  protected server: Server | null = null
  protected app: Express = express()
  abstract appName: string

  protected initServer() {
    this.app.use(express.static(feDistPath))
    this.app.use(express.json())
    this.app.use(cors())
    this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      const token = webuiEntryConfigUtil.getConfig().token
      if (!token) {
        if (req.path === '/set-token') return next()
        res.status(401).json({ success: false, message: '请先设置WebUI密码' })
        return
      }
      const reqToken = req.headers['x-webui-token'] || req.body?.token || req.query?.token
      if (reqToken !== token) {
        res.status(403).json({ success: false, message: 'Token校验失败' })
        return
      }
      next()
    })
    // 设置token接口
    this.app.post('/api/set-token', (req: Request, res: Response) => {
      const { token } = req.body
      if (!token) {
        res.status(400).json({ success: false, message: 'Token不能为空' })
        return
      }
      const config = webuiEntryConfigUtil.getConfig()
      config.token = token
      webuiEntryConfigUtil.writeConfig(config)
      res.json({ success: true, message: 'Token设置成功' })
    })

    this.app.get('/api/config/', (req, res) => {
      try {
        const config = getConfigUtil().getConfig()
        res.json({
          success: true,
          data: {
            config: {
              ...config,
              webui: {
                ...config.webui,
                token: webuiEntryConfigUtil.getConfig().token
              }
            },
            selfInfo,
            loginWebUIPort: webuiEntryConfigUtil.getConfig().port,
          },
        })
      } catch (e) {
        res.status(500).json({ success: false, message: '获取配置失败', error: e })
      }
    })

    // 保存配置接口
    this.app.post('/api/config', (req, res) => {
      try {
        const config = req.body as Config
        const oldConfig = getConfigUtil().getConfig()
        const newConfig = { ...oldConfig, ...config }
        const webuiEntryConfig = webuiEntryConfigUtil.getConfig()
        // @ts-ignore
        webuiEntryConfig.token = newConfig.webui.token
        webuiEntryConfigUtil.writeConfig(webuiEntryConfig)
        // @ts-ignore
        delete newConfig.webui['token']
        this.ctx.parallel('llob/config-updated', newConfig).then()
        getConfigUtil().setConfig(newConfig)
        res.json({ success: true, message: '配置保存成功' })
      } catch (e) {
        res.status(500).json({ success: false, message: '保存配置失败', error: e })
      }
    })
    // 获取登录二维码
    this.app.get('/api/login-qrcode', async (req, res) => {
      this.ctx.ntLoginApi.getLoginQrCode().then(data => {
          res.json({
            success: true,
            data,
          })
        },
      ).catch(e => {
        res.status(500).json({ success: false, message: '获取登录二维码失败', error: e })
      })
    })
    // 获取快速登录账号列表
    this.app.get('/api/quick-login-list', async (req, res) => {
      this.ctx.ntLoginApi.getQuickLoginList().then(data => {
          res.json({
            success: true,
            data,
          })
        },
      ).catch(e => {
        res.status(500).json({ success: false, message: '获取快速登录账号列表失败', error: e })
      })
    })
    // 快速登录
    this.app.post('/api/quick-login', async (req, res) => {
      const { uin } = req.body
      if (!uin) {
        res.status(400).json({ success: false, message: '没有选择QQ号' })
        return
      }
      this.ctx.ntLoginApi.quickLoginWithUin(uin).then((data) => {
          res.json({
            success: true,
            data,
          })
        },
      ).catch(e => {
        res.status(500).json({ success: false, message: '快速登录失败', error: e })
      })
    })
    // 获取账号信息接口
    this.app.get('/api/login-info', (req, res) => {
      res.json({ success: true, data: {...selfInfo, jumpPort: this.getJumpPort()} })
    })
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(feDistPath, 'index.html'))
    })
  }

  abstract getHostPort(): { host: string, port: number }

  abstract getJumpPort(): number | undefined

  async startServer() {
    const { host, port } = this.getHostPort()
    const availablePort = await getAvailablePort(port)
    this.server = this.app.listen(availablePort, host, () => {
      this.ctx.logger.info(`${this.appName} 端口: ${port}`)
    })
    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        this.ctx.logger.error(`${this.appName} 端口 ${port} 被占用，启动失败！`)
      }
      else {
        this.ctx.logger.error(`${this.appName} 启动失败:`, err)
      }
    })
    return availablePort
  }

  stop() {
    this.server?.close()
  }

  restart() {
    this.stop()
    this.start()
  }
}

export class WebUIConfigServer extends WebUIServerBase {
  appName = '配置页 Webui'
  public port?: number = undefined
  static inject = ['ntLoginApi']

  constructor(ctx: Context, public config: WebUIServerConfig) {
    super(ctx, 'webuiConfigServer', true)
    // 获取配置接口
    this.initServer()
    // 监听 config 更新事件
    ctx.on('llob/config-updated', (newConfig: Config) => {
      const oldConfig = { ...this.config }
      this.config = { onlyLocalhost: newConfig.onlyLocalhost, ...newConfig.webui }
      if (oldConfig.onlyLocalhost != newConfig.onlyLocalhost
        || oldConfig.enable != newConfig.webui?.enable
        || oldConfig.port != newConfig.webui?.port
      ) {
        this.ctx.logger.info('WebUI 配置已更新:', this.config)
        this.restart()
      }
    })
  }
  getJumpPort(): number | undefined {
    return undefined
  }

  getHostPort(): { host: string; port: number } {
    const host = this.config.onlyLocalhost ? '127.0.0.1' : ''
    return { host, port: this.config.port }
  }

  async start() {
    if (!this.config?.enable) {
      return
    }
    this.port = await this.startServer()
  }
}

export class WebUIEntryServer extends WebUIServerBase {
  static inject = ['ntLoginApi', 'webuiConfigServer']
  appName = '登录页 WebUI'

  constructor(ctx: Context, private ntLoginApi: any) {
    super(ctx, 'webUIEntryServer', true)
    this.initServer()
  }
  getJumpPort(): number | undefined {
    return this.ctx.webuiConfigServer.port
  }

  async start() {
    const port = await super.startServer()
    pmhq.tellPort(port).catch((err: Error) => {
      this.ctx.logger.error('记录WebUI端口失败:', err)
    })
  }

  getHostPort(): { host: string; port: number } {
    const config = webuiEntryConfigUtil.getConfig()
    return { host: config.host, port: config.port }
  }
}

