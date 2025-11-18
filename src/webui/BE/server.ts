import express, { Application, Express, NextFunction, Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfigUtil, webuiTokenUtil } from '@/common/config'
import { Config, WebUIConfig } from '@/common/types'
import { Server } from 'http'
import { Socket } from 'net'
import { hashPassword } from './passwordHash'
import { Context, Service } from 'cordis'
import { selfInfo, LOG_DIR } from '@/common/globalVars'
import { getAvailablePort } from '@/common/utils/port'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { ReqConfig, ResConfig } from './types'
import { appendFileSync } from 'node:fs'
import { sleep } from '@/common/utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 静态文件服务，指向前端dist目录
let feDistPath = path.resolve(__dirname, 'webui/')
// @ts-ignore
if (!import.meta.env) {
  feDistPath = path.join(__dirname, '../../../dist/webui/')
}

declare module 'cordis' {
  interface Context {
    webuiServer: WebUIServer
  }
}

export interface WebUIServerConfig extends WebUIConfig {
  onlyLocalhost: boolean
}

// 全局密码错误记录
interface GlobalLoginAttempt {
  consecutiveFailures: number
  lockedUntil: number | null
  lastAttempt: number
}

// 全局登录失败记录（不基于IP）
let globalLoginAttempt: GlobalLoginAttempt = {
  consecutiveFailures: 0,
  lockedUntil: null,
  lastAttempt: 0,
}

// 确保日志目录存在

const accessLogPath = path.join(LOG_DIR, 'webui_access.log')

// 记录访问日志
function logAccess(ip: string, method: string, path: string, status: number, message?: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `${timestamp} | IP: ${ip} | ${method} ${path} | Status: ${status}${message ? ` | ${message}` : ''}\n`
  try {
    appendFileSync(accessLogPath, logEntry)
  } catch (err) {
    console.error('写入访问日志失败:', err)
  }
}

// 清理过期的锁定（每小时执行一次）
setInterval(() => {
  if (globalLoginAttempt.lockedUntil) {
    const now = Date.now()
    if (now >= globalLoginAttempt.lockedUntil) {
      globalLoginAttempt.consecutiveFailures = 0
      globalLoginAttempt.lockedUntil = null
    }
  }
}, 60 * 60 * 1000)

export class WebUIServer extends Service {
  private server: Server | null = null
  private app: Express = express()
  private connections = new Set<Socket>()
  private currentPort?: number
  public port?: number = undefined
  static inject = ['ntLoginApi']

  constructor(ctx: Context, public config: WebUIServerConfig) {
    super(ctx, 'webuiServer', true)
    // 初始化服务器路由
    this.initServer()
    // 监听 config 更新事件
    ctx.on('llob/config-updated', (newConfig: Config) => {
      const oldConfig = { ...this.config }
      this.setConfig(newConfig)
      const forcePort = (oldConfig.port === newConfig.webui?.port) ? this.currentPort : undefined
      if (oldConfig.onlyLocalhost != newConfig.onlyLocalhost
        || oldConfig.enable != newConfig.webui?.enable
        || oldConfig.port != newConfig.webui?.port
      ) {
        this.ctx.logger.info('WebUI 配置已更新:', this.config)
        setTimeout(() => this.restart(forcePort), 1000)
      }
    })
  }

  private initServer() {
    this.app.use(express.static(feDistPath))
    this.app.use(express.json())
    this.app.use(cors())
    this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      // 获取客户端IP地址
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown'

      const token = webuiTokenUtil.getToken()
      if (!token) {
        if (req.path === '/set-token') return next()
        logAccess(clientIp, req.method, req.path, 401, '未设置密码')
        res.status(401).json({ success: false, message: '请先设置WebUI密码' })
        return
      }

      // 检查是否被全局锁定
      if (globalLoginAttempt.lockedUntil) {
        const now = Date.now()
        if (now < globalLoginAttempt.lockedUntil) {
          const remainingMinutes = Math.ceil((globalLoginAttempt.lockedUntil - now) / (60 * 1000))
          logAccess(clientIp, req.method, req.path, 403, `账户锁定中，剩余${remainingMinutes}分钟`)
          res.status(403).json({
            success: false,
            message: `密码错误次数过多，请在 ${remainingMinutes} 分钟后重试`,
            locked: true,
            remainingMinutes,
          })
          return
        }
        else {
          // 锁定时间已过，重置记录
          globalLoginAttempt.consecutiveFailures = 0
          globalLoginAttempt.lockedUntil = null
        }
      }

      const reqToken = req.headers['x-webui-token'] || req.query?.token
      if (!reqToken) {
        res.status(403).json({
          success: false,
          message: `请输入密码`,
        })
        return
      }

      // 将存储的明文密码 hash 后与前端传来的 hash 对比
      const hashedToken = hashPassword(token)
      if (reqToken !== hashedToken) {
        // 记录失败尝试
        globalLoginAttempt.consecutiveFailures++
        globalLoginAttempt.lastAttempt = Date.now()

        const passwordFailureMax = 4
        // 如果连续失败次数达到3次，锁定1小时
        if (globalLoginAttempt.consecutiveFailures >= passwordFailureMax) {
          globalLoginAttempt.lockedUntil = Date.now() + (60 * 60 * 1000) // 1小时
          logAccess(clientIp, req.method, req.path, 403, `密码连续错误${passwordFailureMax - 1}次，账户锁定1小时`)
          res.status(403).json({
            success: false,
            message: '密码连续错误3次，账户已被锁定1小时',
            locked: true,
            remainingMinutes: 60,
          })
          return
        }

        const remainingAttempts = passwordFailureMax - globalLoginAttempt.consecutiveFailures
        logAccess(clientIp, req.method, req.path, 403, `Token验证失败，剩余${remainingAttempts}次尝试`)
        res.status(403).json({
          success: false,
          message: `Token校验失败，剩余尝试次数：${remainingAttempts}`,
          remainingAttempts,
        })
        return
      }

      // 登录成功，重置失败记录
      if (globalLoginAttempt.consecutiveFailures > 0) {
        logAccess(clientIp, req.method, req.path, 200, '登录成功，重置失败计数')
        globalLoginAttempt.consecutiveFailures = 0
        globalLoginAttempt.lockedUntil = null
      }

      logAccess(clientIp, req.method, req.path, 200)
      next()
    })
    // 设置token接口
    this.app.post('/api/set-token', (req: Request, res: Response) => {
      const { token } = req.body
      if (!token) {
        res.status(400).json({ success: false, message: 'Token不能为空' })
        return
      }
      webuiTokenUtil.setToken(token)
      res.json({ success: true, message: 'Token设置成功' })
    })

    this.app.get('/api/config/', (req, res) => {
      try {
        const config = getConfigUtil().getConfig()
        const resJson: ResConfig = {
          config,
          selfInfo,
        }
        res.json({
          success: true,
          data: resJson,
        })
      } catch (e) {
        res.status(500).json({ success: false, message: '获取配置失败', error: e })
      }
    })

    // 保存配置接口
    this.app.post('/api/config', (req, res) => {
      try {
        const { config } = req.body as ReqConfig
        const oldConfig = getConfigUtil().getConfig()
        const newConfig = { ...oldConfig, ...config }
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
            message: data.loginErrorInfo.errMsg,
          })
        },
      ).catch(e => {
        res.status(500).json({ success: false, message: '快速登录失败', error: e })
      })
    })
    // 获取账号信息接口
    this.app.get('/api/login-info', (req, res) => {
      res.json({ success: true, data: selfInfo })
    })
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(feDistPath, 'index.html'))
    })
  }

  private getHostPort(): { host: string; port: number } {
    const host = this.config.onlyLocalhost ? '127.0.0.1' : ''
    return { host, port: this.config.port }
  }

  private async startServer(forcePort?: number) {
    const { host, port } = this.getHostPort()
    const targetPort = forcePort !== undefined ? forcePort : await getAvailablePort(port)
    this.server = this.app.listen(targetPort, host, () => {
      this.currentPort = targetPort
      this.ctx.logger.info(`Webui 服务器已启动 ${host}:${targetPort}`)
    })

    // 跟踪所有连接，以便在停止时能够关闭它们
    this.server.on('connection', (conn) => {
      this.connections.add(conn)
      conn.on('close', () => {
        this.connections.delete(conn)
      })
    })

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        this.ctx.logger.error(`Webui 端口 ${targetPort} 被占用，启动失败！`)
      }
      else {
        this.ctx.logger.error(`Webui 启动失败:`, err)
      }
    })
    return targetPort
  }

  stop() {
    return new Promise<void>((resolve) => {
      if (this.server) {
        // 先关闭所有现有连接
        if (this.connections.size > 0) {
          this.ctx.logger.info(`Webui 正在关闭 ${this.connections.size} 个连接...`)
          for (const conn of this.connections) {
            conn.destroy()
          }
          this.connections.clear()
        }

        // 然后关闭服务器
        this.server.close((err) => {
          if (err) {
            this.ctx.logger.error(`Webui 停止时出错:`, err)
          }
          else {
            this.ctx.logger.info(`Webui 服务器已停止`)
          }
          this.server = null
          // 不清空 currentPort，以便 restart 时复用
          resolve()
        })
      }
      else {
        this.ctx.logger.info(`Webui 服务器未运行`)
        resolve()
      }
    })
  }

  async restart(forcePort?: number) {
    await this.stop()
    // 等待端口完全释放（Windows 上需要）
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.startWithPort(forcePort)
  }

  public setConfig(newConfig: Config) {
    const oldConfig = { ...this.config }
    this.config = { onlyLocalhost: newConfig.onlyLocalhost, ...newConfig.webui }
  }

  async start() {
    if (!this.config?.enable) {
      return
    }
    this.port = await this.startServer()
    pmhq.tellPort(this.port).catch((err: Error) => {
      this.ctx.logger.error('记录 WebUI 端口失败:', err)
    })
  }

  private async startWithPort(forcePort?: number): Promise<void> {
    if (!this.config?.enable) {
      return
    }
    this.port = await this.startServer(forcePort)
    pmhq.tellPort(this.port).catch((err: Error) => {
      this.ctx.logger.error('记录 WebUI 端口失败:', err)
    })
  }
}

