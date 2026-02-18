import express, { Express, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { Config, WebUIConfig } from '@/common/types'
import { Server } from 'http'
import { Socket } from 'net'
import { Context, Service } from 'cordis'
import { TEMP_DIR } from '@/common/globalVars'
import { getAvailablePort } from '@/common/utils/port'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { ChatType, RawMessage } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'node:fs'

import { authMiddleware } from './auth'
import { serializeResult } from './utils'
import {
  createConfigRoutes,
  createDashboardRoutes,
  createLoginRoutes,
  createLogsRoutes,
  createWebQQRoutes,
  createNtCallRoutes,
  createEmailRoutes
} from './routes'

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
}

export class WebUIServer extends Service {
  private server: Server | null = null
  private app: Express = express()
  private connections = new Set<Socket>()
  private currentPort?: number
  public port?: number = undefined
  private sseClients: Set<Response> = new Set()
  private upload: multer.Multer
  private fileUpload: multer.Multer
  private uploadDir: string
  static inject = {
    ntLoginApi: {
      required: true
    },
    ntFriendApi: {
      required: true
    },
    ntGroupApi: {
      required: true
    },
    ntSystemApi: {
      required: true
    },
    ntMsgApi: {
      required: true
    },
    ntUserApi: {
      required: true
    },
    ntFileApi: {
      required: true
    },
    emailNotification: {
      required: false
    }
  }

  constructor(ctx: Context, public config: WebUIServerConfig) {
    super(ctx, 'webuiServer', true)
    this.uploadDir = path.join(TEMP_DIR, 'webqq-uploads')
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true })
    }
    this.upload = this.createImageUpload()
    this.fileUpload = this.createFileUpload()
    this.initServer()
    this.setupMessageListener()
    this.setupConfigListener()
  }

  private createImageUpload(): multer.Multer {
    return multer({
      storage: multer.diskStorage({
        destination: this.uploadDir,
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname)
          cb(null, `${randomUUID()}${ext}`)
        }
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg']
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new Error('不支持的图片格式，仅支持 JPG、PNG、GIF'))
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }
    })
  }

  private createFileUpload(): multer.Multer {
    return multer({
      storage: multer.diskStorage({
        destination: this.uploadDir,
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname)
          cb(null, `${randomUUID()}${ext}`)
        }
      })
    })
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
    this.app.use(express.json())
    this.app.use(cors())
    this.app.use('/api', authMiddleware)

    // 注册路由
    this.app.use('/api', createConfigRoutes(this.ctx))
    this.app.use('/api', createLoginRoutes(this.ctx))
    this.app.use('/api', createDashboardRoutes(this.ctx))
    this.app.use('/api', createLogsRoutes(this.ctx))
    this.app.use('/api', createNtCallRoutes(this.ctx))
    this.app.use('/api/email', createEmailRoutes(this.ctx))
    this.app.use('/api/webqq', createWebQQRoutes(this.ctx, {
      upload: this.upload,
      fileUpload: this.fileUpload,
      uploadDir: this.uploadDir,
      sseClients: this.sseClients,
      createPicElement: this.createPicElement.bind(this)
    }))

    // 静态文件服务
    this.app.use(express.static(feDistPath))
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(feDistPath, 'index.html'))
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

  public broadcastMessage(event: string, data: any) {
    const serializedData = serializeResult(data)
    const message = `event: ${event}\ndata: ${JSON.stringify(serializedData)}\n\n`
    for (const client of this.sseClients) {
      client.write(message)
    }
  }

  private setupMessageListener() {
    // 监听新消息事件
    this.ctx.on('nt/message-created', async (message: RawMessage) => {
      if (this.sseClients.size === 0) return
      await this.fillPeerUin(message)
      this.broadcastMessage('message', { type: 'message-created', data: message })
    })

    // 监听自己发送的消息
    this.ctx.on('nt/message-sent', async (message: RawMessage) => {
      if (this.sseClients.size === 0) return
      await this.fillPeerUin(message)
      this.broadcastMessage('message', { type: 'message-sent', data: message })
    })

    // 监听消息撤回事件
    this.ctx.on('nt/message-deleted', async (message: RawMessage) => {
      if (this.sseClients.size === 0) return
      const revokeElement = message.elements[0]?.grayTipElement?.revokeElement
      await this.fillPeerUin(message)
      this.broadcastMessage('message', {
        type: 'message-deleted',
        data: {
          msgId: message.msgId,
          msgSeq: message.msgSeq,
          chatType: message.chatType,
          peerUid: message.peerUid,
          peerUin: message.peerUin,
          operatorUid: revokeElement?.operatorUid,
          operatorNick: revokeElement?.operatorNick || revokeElement?.operatorMemRemark || revokeElement?.operatorRemark,
          isSelfOperate: revokeElement?.isSelfOperate,
          wording: revokeElement?.wording
        }
      })
    })

    // 监听表情回应事件
    this.setupEmojiReactionListener()
  }

  private async fillPeerUin(message: RawMessage) {
    if (message.chatType === ChatType.C2C && (!message.peerUin || message.peerUin === '0') && message.peerUid) {
      const uin = await this.ctx.ntUserApi.getUinByUid(message.peerUid)
      if (uin) {
        message.peerUin = uin
      }
    }
  }

  private setupEmojiReactionListener() {
    pmhq.addResListener(async data => {
      if (this.sseClients.size === 0) return
      if (data.type !== 'recv' || data.data.cmd !== 'trpc.msg.olpush.OlPushService.MsgPush') return

      try {
        const { Msg } = await import('@/ntqqapi/proto')
        const pushMsg = Msg.PushMsg.decode(Buffer.from(data.data.pb, 'hex'))
        if (!pushMsg.message?.body) return

        const { msgType, subType } = pushMsg.message?.contentHead ?? {}
        if (msgType === 732 && subType === 16) {
          const notify = Msg.NotifyMessageBody.decode(pushMsg.message.body.msgContent.subarray(7))
          if (notify.field13 === 35) {
            const info = notify.reaction.data.body.info
            const target = notify.reaction.data.body.target
            const groupCode = String(notify.groupCode)
            const userId = await this.ctx.ntUserApi.getUinByUid(info.operatorUid)

            let userName = userId
            try {
              const membersResult = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
              if (membersResult?.result?.infos) {
                for (const [, member] of membersResult.result.infos) {
                  if (member.uid === info.operatorUid || member.uin === userId) {
                    userName = member.cardName || member.nick || userId
                    break
                  }
                }
              }
            } catch { }

            this.broadcastMessage('message', {
              type: 'emoji-reaction',
              data: {
                groupCode,
                msgSeq: String(target.sequence),
                emojiId: info.code,
                userId,
                userName,
                isAdd: info.type === 1
              }
            })
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    })
  }

  private getHostPort(): { host: string; port: number } {
    return { host: this.config.host, port: this.config.port }
  }

  private async startServer(forcePort?: number) {
    const { host, port } = this.getHostPort()
    const targetPort = forcePort !== undefined ? forcePort : await getAvailablePort(port)
    this.server = this.app.listen(targetPort, host, () => {
      this.currentPort = targetPort
      this.ctx.logger.info(`Webui 服务器已启动 ${host}:${targetPort}`)
    })

    this.server.on('connection', (conn) => {
      this.connections.add(conn)
      conn.on('close', () => {
        this.connections.delete(conn)
      })
    })

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        this.ctx.logger.error(`Webui 端口 ${targetPort} 被占用，启动失败！`)
      } else {
        this.ctx.logger.error(`Webui 启动失败:`, err)
      }
    })
    return targetPort
  }

  stop() {
    return new Promise<void>((resolve) => {
      if (this.server) {
        if (this.connections.size > 0) {
          this.ctx.logger.info(`Webui 正在关闭 ${this.connections.size} 个连接...`)
          for (const conn of this.connections) {
            conn.destroy()
          }
          this.connections.clear()
        }

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
    console.log('webui start')
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
