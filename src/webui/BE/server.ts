import path from 'path'
import { Config, WebUIConfig } from '@/common/types'
import { Context, Service } from 'cordis'
import { TEMP_DIR } from '@/common/globalVars'
import { getAvailablePort } from '@/common/utils/port'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { ChatType, RawMessage, FriendRequest } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
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
import { Msg } from '@/ntqqapi/proto'
import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { SSEStreamingApi } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve, ServerType } from '@hono/node-server'

// 静态文件服务，指向前端dist目录
let feDistPath = path.resolve(import.meta.dirname, 'webui/')
// @ts-expect-error: TS2339 - Property 'env' does not exist on type 'ImportMeta'
if (!import.meta.env) {
  feDistPath = path.join(import.meta.dirname, '../../../dist/webui/')
}

declare module 'cordis' {
  interface Context {
    webuiServer: WebUIServer
  }
}

export interface WebUIServerConfig extends WebUIConfig {
}

export class WebUIServer extends Service {
  private server: ServerType | null = null
  private app: Hono = new Hono()
  private currentPort?: number
  public port?: number = undefined
  private sseClients: Set<SSEStreamingApi> = new Set()
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

    // 注册路由
    this.app.route('/api', createConfigRoutes(this.ctx))
    this.app.route('/api', createLoginRoutes(this.ctx))
    this.app.route('/api', createDashboardRoutes(this.ctx))
    this.app.route('/api', createLogsRoutes(this.ctx))
    this.app.route('/api', createNtCallRoutes(this.ctx))
    this.app.route('/api/email', createEmailRoutes(this.ctx))
    this.app.route('/api/webqq', createWebQQRoutes(this.ctx, {
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

    // 监听群通知事件（加群申请、邀请入群、被踢等）
    this.ctx.on('nt/group-notify', async ({ notify, doubt }) => {
      if (this.sseClients.size === 0) return
      try {
        const user1Uin = notify.user1.uid ? await this.ctx.ntUserApi.getUinByUid(notify.user1.uid).catch(() => '') : ''
        const user2Uin = notify.user2.uid ? await this.ctx.ntUserApi.getUinByUid(notify.user2.uid).catch(() => '') : ''
        this.broadcastMessage('message', {
          type: 'group-notify',
          data: {
            seq: notify.seq,
            notifyType: notify.type,
            status: notify.status,
            doubt,
            group: notify.group,
            user1: { ...notify.user1, uin: user1Uin },
            user2: { ...notify.user2, uin: user2Uin },
            postscript: notify.postscript,
            actionTime: notify.actionTime,
            flag: `${notify.group.groupCode}|${notify.seq}|${notify.type}|${doubt ? '1' : '0'}`
          }
        })
      } catch (e) {
        this.ctx.logger.error('处理群通知事件失败:', e)
      }
    })

    // 监听好友申请事件
    this.ctx.on('nt/friend-request', async (req: FriendRequest) => {
      if (this.sseClients.size === 0) return
      try {
        const uin = await this.ctx.ntUserApi.getUinByUid(req.friendUid).catch(() => '')
        this.broadcastMessage('message', {
          type: 'friend-request',
          data: {
            friendUid: req.friendUid,
            friendUin: uin,
            friendNick: req.friendNick,
            friendAvatarUrl: req.friendAvatarUrl,
            reqTime: req.reqTime,
            extWords: req.extWords,
            isDecide: req.isDecide,
            reqType: req.reqType,
            addSource: req.addSource || '',
            flag: `${req.friendUid}|${req.reqTime}`
          }
        })
      } catch (e) {
        this.ctx.logger.error('处理好友申请事件失败:', e)
      }
    })

    // 监听群解散事件
    this.ctx.on('nt/group-dismiss', (data) => {
      if (this.sseClients.size === 0) return
      this.broadcastMessage('message', {
        type: 'group-dismiss',
        data: {
          groupCode: data.groupCode,
          groupName: data.groupName
        }
      })
    })

    // 监听主动退群事件
    this.ctx.on('nt/group-quit', (data) => {
      if (this.sseClients.size === 0) return
      this.broadcastMessage('message', {
        type: 'group-quit',
        data: {
          groupCode: data.groupCode,
          groupName: data.groupName
        }
      })
    })
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
                isAdd: info.actionType === 1
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
