import express, { Application, Express, NextFunction, Request, Response } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfigUtil } from '@/common/config'
import { Config, WebUIConfig } from '@/common/types'
import { Server } from 'http'
import { Context, Service } from 'cordis'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 静态文件服务，指向前端dist目录
const feDistPath = path.resolve(__dirname, 'webui/')

export interface WebUIServerConfig extends WebUIConfig{
  onlyLocalhost: boolean
}

export class WebUIServer extends Service {
  static inject = []
  private server: Server | null = null
  private app: Express = express()

  constructor(ctx: Context, public config: WebUIServerConfig) {
    super(ctx)
    this.app.use(express.static(feDistPath))
    this.app.use(express.json())

    // token 校验中间件
    this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      const config = getConfigUtil().getConfig()
      const token = config.webui?.token
      if (!token) {
        if (req.path === '/set-token') return next()
        return res.status(401).json({ success: false, message: '请先设置WebUI密码' })
      }
      const reqToken = req.headers['x-webui-token'] || req.body?.token || req.query?.token
      if (reqToken !== token) {
        return res.status(403).json({ success: false, message: 'Token校验失败' })
      }
      next()
    })

    // 获取配置接口
    this.app.get('/api/config/', (req, res) => {
      try {
        const config = getConfigUtil().getConfig()
        res.json({ success: true, data: config })
      } catch (e) {
        res.status(500).json({ success: false, message: '获取配置失败', error: String(e) })
      }
    })

    // 保存配置接口
    this.app.post('/api/config', (req, res) => {
      try {
        const config = req.body as Config
        getConfigUtil().setConfig(config)
        res.json({ success: true, message: '配置保存成功' })
      } catch (e) {
        res.status(500).json({ success: false, message: '保存配置失败', error: String(e) })
      }
    })

    // 设置token接口
    this.app.post('/api/set-token', (req, res) => {
      const { token } = req.body
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token不能为空' })
      }
      const config = getConfigUtil().getConfig()
      config.webui.token = token
      getConfigUtil().setConfig(config)
      res.json({ success: true, message: 'Token设置成功' })
    })

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(feDistPath, 'index.html'))
    })
  }

  // Override the base Service.start() signature to match expected arguments
  start() {
    if (!this.config?.enable) {
      return
    }

    const port = this.config.port ?? 3080
    const host = this.config.onlyLocalhost ? 'localhost' : '::'

    this.server = this.app.listen(port, host, () => {
      console.log(`WebUI 后端已启动：http://${host}:${port}`)
      console.log('静态文件目录:', feDistPath)
    })
  }

  stop() {
    this.server?.close()
  }

  restart() {
    this.stop()
    this.start()
  }
}

