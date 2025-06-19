import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfigUtil } from '@/common/config'
import { Config } from '@/common/types'
import { Server } from 'http'
import { Context } from 'cordis'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 静态文件服务，指向前端dist目录
const feDistPath = path.resolve(__dirname, 'webui/')


export default class WebUIServer {
  private server: Server | null = null

  private app = express()

  constructor(ctx: Context) {
    this.app.use(express.static(feDistPath))
    this.app.use(express.json())


    // 获取配置接口
    this.app.get('/api/config', (req, res) => {
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

    // 兜底：返回前端index.html（支持history路由）
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(feDistPath, 'index.html'))
    })
  }

  start(config: Config) {
    if (!config.webui?.enable) {
      return
    }

    const port = config.webui?.port ?? 8080
    const host = config.onlyLocalhost ? 'localhost' : '::'

    this.server = app.listen(port, host, () => {
      console.log(`WebUI 后端已启动：http://${host}:${port}`)
      console.log('静态文件目录:', feDistPath)
    })
  }

  stop() {
    this.server?.close()
  }

  restart(config: Config) {
    this.stop()
    this.start(config)
  }
}