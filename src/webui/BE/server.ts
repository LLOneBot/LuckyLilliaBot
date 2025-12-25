import express, { Express, NextFunction, Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfigUtil, webuiTokenUtil } from '@/common/config'
import { Config, WebUIConfig } from '@/common/types'
import { Server } from 'http'
import { Socket } from 'net'
import { hashPassword } from './passwordHash'
import { Context, Service } from 'cordis'
import { selfInfo, LOG_DIR, TEMP_DIR } from '@/common/globalVars'
import { getAvailablePort } from '@/common/utils/port'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { ReqConfig, ResConfig } from './types'
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { ChatType, ElementType, RawMessage, MessageElement } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import multer from 'multer'
import { randomUUID } from 'crypto'

import { getLogCache, LogRecord } from '../../main/log'

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
  private sseClients: Set<Response> = new Set()
  private upload: multer.Multer
  static inject = ['ntLoginApi', 'ntFriendApi', 'ntGroupApi', 'ntSystemApi', 'ntMsgApi', 'ntUserApi', 'ntFileApi']

  constructor(ctx: Context, public config: WebUIServerConfig) {
    super(ctx, 'webuiServer', true)
    // 配置 multer 用于文件上传
    const uploadDir = path.join(TEMP_DIR, 'webqq-uploads')
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true })
    }
    this.upload = multer({
      storage: multer.diskStorage({
        destination: uploadDir,
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
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
      }
    })
    // 初始化服务器路由
    this.initServer()
    // 监听消息事件，推送给 SSE 客户端
    this.setupMessageListener()
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

    // 获取 Dashboard 统计数据
    this.app.get('/api/dashboard/stats', async (req, res) => {
      try {
        const app = this.ctx.get('app')
        if (!app) {
          res.status(503).json({ success: false, message: '服务尚未就绪，请等待登录完成' })
          return
        }
        const friends = await this.ctx.ntFriendApi.getBuddyList()
        const groups = await this.ctx.ntGroupApi.getGroups(false)

        // 获取 QQ 进程资源
        const qqInfo = await pmhq.getProcessInfo()
        const qqMemory = qqInfo?.memory?.rss || 0
        const qqCpu = qqInfo?.cpu?.percent || 0
        const qqTotalMem = qqInfo?.memory?.totalMem || 1
        const qqMemoryPercent = (qqMemory / qqTotalMem) * 100

        // Bot 进程资源（使用 Node.js 自己获取系统总内存）
        const os = await import('os')
        const botTotalMem = os.totalmem()
        const cpuCores = os.cpus().length
        const memUsage = process.memoryUsage()
        const cpuUsage = process.cpuUsage()
        // CPU 百分比需要除以核心数，得到相对于整个系统的占用
        const botCpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() / cpuCores) * 100
        const botMemoryPercent = (memUsage.rss / botTotalMem) * 100

        res.json({
          success: true,
          data: {
            friendCount: friends.length,
            groupCount: groups.length,
            messageReceived: app.messageReceivedCount,
            messageSent: app.messageSentCount,
            startupTime: app.startupTime,
            lastMessageTime: app.lastMessageTime,
            bot: {
              memory: memUsage.rss,
              totalMemory: botTotalMem,
              memoryPercent: botMemoryPercent,
              cpu: botCpuPercent,
            },
            qq: {
              memory: qqMemory,
              totalMemory: qqTotalMem,
              memoryPercent: qqMemoryPercent,
              cpu: qqCpu,
            },
          },
        })
      } catch (e) {
        res.status(500).json({ success: false, message: '获取统计数据失败', error: e })
      }
    })
    // 获取设备信息（QQ 版本号）
    this.app.get('/api/device-info', async (req, res) => {
      try {
        const deviceInfo = await this.ctx.ntSystemApi.getDeviceInfo()
        res.json({
          success: true,
          data: deviceInfo,
        })
      } catch (e) {
        res.status(500).json({ success: false, message: '获取设备信息失败', error: e })
      }
    })

    // SSE 日志流端点
    this.app.get('/api/logs/stream', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      // 发送连接确认事件
      res.write(`event: connected\ndata: {}\n\n`)

      // 先发送历史日志
      for (const record of getLogCache()) {
        res.write(`data: ${JSON.stringify(record)}\n\n`)
      }

      const dispose = this.ctx.on('llob/log', (record: LogRecord) => {
        res.write(`data: ${JSON.stringify(record)}\n\n`)
      })

      req.on('close', () => {
        dispose()
      })
    })

    // ==================== WebQQ API ====================
    this.initWebQQRoutes()

    // 静态文件服务放在 API 路由之后
    this.app.use(express.static(feDistPath))

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(feDistPath, 'index.html'))
    })
  }

  // WebQQ API 路由初始化
  private initWebQQRoutes() {
    // 获取好友列表
    this.app.get('/api/webqq/friends', async (req, res) => {
      try {
        // 获取带分组的好友列表
        const buddyV2Result = await this.ctx.ntFriendApi.getBuddyV2(true)
        const buddyList = await this.ctx.ntFriendApi.getBuddyList()
        
        // 创建 uid -> SimpleInfo 的映射
        const buddyMap = new Map<string, typeof buddyList[0]>()
        for (const buddy of buddyList) {
          buddyMap.set(buddy.uid!, buddy)
        }
        
        // 构建分组数据
        const categories = (buddyV2Result.data || []).map((category: any) => {
          const friends = (category.buddyUids || [])
            .map((uid: string) => buddyMap.get(uid))
            .filter((buddy: any) => buddy)
            .map((buddy: any) => ({
              uid: buddy.uid,
              uin: buddy.uin,
              nickname: buddy.coreInfo.nick,
              remark: buddy.coreInfo.remark || '',
              avatar: `https://q1.qlogo.cn/g?b=qq&nk=${buddy.uin}&s=640`,
              online: buddy.status?.status === 10 || false
            }))
          
          return {
            categoryId: category.categoryId,
            categoryName: category.categroyName || '我的好友',
            categorySort: category.categorySortId,
            onlineCount: category.onlineCount || 0,
            memberCount: category.categroyMbCount || friends.length,
            friends
          }
        })
        
        // 按 categorySort 排序
        categories.sort((a: any, b: any) => a.categorySort - b.categorySort)
        
        res.json({ success: true, data: categories })
      } catch (e: any) {
        this.ctx.logger.error('获取好友列表失败:', e)
        res.status(500).json({ success: false, message: '获取好友列表失败', error: e.message })
      }
    })

    // 获取群组列表
    this.app.get('/api/webqq/groups', async (req, res) => {
      try {
        const groups = await this.ctx.ntGroupApi.getGroups(false)
        const groupItems = groups.map(group => ({
          groupCode: group.groupCode,
          groupName: group.groupName,
          avatar: `https://p.qlogo.cn/gh/${group.groupCode}/${group.groupCode}/640/`,
          memberCount: group.memberCount
        }))
        res.json({ success: true, data: groupItems })
      } catch (e: any) {
        this.ctx.logger.error('获取群组列表失败:', e)
        res.status(500).json({ success: false, message: '获取群组列表失败', error: e.message })
      }
    })

    // 获取最近会话列表
    this.app.get('/api/webqq/recent', async (req, res) => {
      try {
        const result = await this.ctx.ntUserApi.getRecentContactListSnapShot(50)
        const recentItems = result.info.changedList
          .filter(item => {
            // 过滤掉无效的会话（peerId 为空或为 0）
            const peerId = item.peerUin || item.peerUid
            return peerId && peerId !== '0' && peerId !== ''
          })
          .map(item => {
            const isC2C = item.chatType === ChatType.C2C
            // For groups, peerUin contains the group code (number as string)
            const groupCode = item.peerUin || item.peerUid
            return {
              chatType: isC2C ? 'friend' : 'group',
              peerId: isC2C ? item.peerUin : groupCode,
              peerName: item.peerName || item.remark || item.peerUin,
              peerAvatar: isC2C
                ? `https://q1.qlogo.cn/g?b=qq&nk=${item.peerUin}&s=640`
                : `https://p.qlogo.cn/gh/${groupCode}/${groupCode}/640/`,
              lastMessage: this.extractAbstractContent(item.abstractContent),
              lastTime: parseInt(item.msgTime) * 1000,
              unreadCount: parseInt(item.unreadCnt) || 0
            }
          })
        // 按时间排序
        recentItems.sort((a, b) => b.lastTime - a.lastTime)
        res.json({ success: true, data: recentItems })
      } catch (e: any) {
        this.ctx.logger.error('获取最近会话失败:', e)
        res.status(500).json({ success: false, message: '获取最近会话失败', error: e.message })
      }
    })

    // 获取消息历史 - 返回原始 RawMessage 数据
    this.app.get('/api/webqq/messages', async (req, res) => {
      try {
        const { chatType, peerId, beforeMsgId, limit = '20' } = req.query as {
          chatType: string
          peerId: string
          beforeMsgId?: string
          limit?: string
        }

        if (!chatType || !peerId) {
          res.status(400).json({ success: false, message: '缺少必要参数' })
          return
        }

        // 构建 peer 对象
        // 对于私聊，peerUid 需要是 uid（内部ID），不是 uin（QQ号）
        // 对于群聊，peerUid 直接用群号
        let peerUid = peerId
        if (chatType === 'friend') {
          // 将 uin（QQ号）转换为 uid
          const uid = await this.ctx.ntUserApi.getUidByUin(peerId)
          if (!uid) {
            res.status(400).json({ success: false, message: '无法获取用户信息' })
            return
          }
          peerUid = uid
        }

        const peer = {
          chatType: chatType === 'friend' ? ChatType.C2C : ChatType.Group,
          peerUid,
          guildId: ''
        }

        // 初次加载使用 getAioFirstViewLatestMsgs，加载更多使用 getMsgHistory
        let result
        if (!beforeMsgId || beforeMsgId === '0') {
          result = await this.ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, parseInt(limit))
        } else {
          result = await this.ctx.ntMsgApi.getMsgHistory(peer, beforeMsgId, parseInt(limit))
        }

        const messages = result?.msgList || []

        // 消息按时间正序排列
        messages.sort((a: RawMessage, b: RawMessage) => parseInt(a.msgTime) - parseInt(b.msgTime))

        res.json({
          success: true,
          data: {
            messages,
            hasMore: messages.length >= parseInt(limit)
          }
        })
      } catch (e: any) {
        this.ctx.logger.error('获取消息历史失败:', e)
        res.status(500).json({ success: false, message: '获取消息历史失败', error: e.message })
      }
    })

    // 发送消息
    this.app.post('/api/webqq/messages', async (req, res) => {
      try {
        const { chatType, peerId, content } = req.body as {
          chatType: string
          peerId: string
          content: { type: string; text?: string; imagePath?: string; msgId?: string; msgSeq?: string }[]
        }

        if (!chatType || !peerId || !content || content.length === 0) {
          res.status(400).json({ success: false, message: '缺少必要参数' })
          return
        }

        // 构建 peer 对象
        // 对于私聊，peerUid 需要是 uid（内部ID），不是 uin（QQ号）
        // 对于群聊，peerUid 直接用群号
        let peerUid = peerId
        if (chatType === 'friend') {
          const uid = await this.ctx.ntUserApi.getUidByUin(peerId)
          if (!uid) {
            res.status(400).json({ success: false, message: '无法获取用户信息' })
            return
          }
          peerUid = uid
        }

        const peer = {
          chatType: chatType === 'friend' ? ChatType.C2C : ChatType.Group,
          peerUid,
          guildId: ''
        }

        const elements: any[] = []
        for (const item of content) {
          if (item.type === 'reply' && item.msgId && item.msgSeq) {
            elements.push({
              elementType: ElementType.Reply,
              elementId: '',
              replyElement: {
                replayMsgId: item.msgId,
                replayMsgSeq: item.msgSeq,
                sourceMsgText: '',
                senderUid: '',
                senderUidStr: ''
              }
            })
          } else if (item.type === 'text' && item.text) {
            elements.push({
              elementType: ElementType.Text,
              elementId: '',
              textElement: {
                content: item.text,
                atType: 0,
                atUid: '',
                atTinyId: '',
                atNtUid: ''
              }
            })
          } else if (item.type === 'image' && item.imagePath) {
            // 图片消息需要先上传
            const picElement = await this.createPicElement(item.imagePath)
            if (picElement) {
              elements.push(picElement)
            }
          }
        }

        if (elements.length === 0) {
          res.status(400).json({ success: false, message: '消息内容为空' })
          return
        }

        const result = await this.ctx.ntMsgApi.sendMsg(peer, elements)
        res.json({
          success: true,
          data: { msgId: result.msgId }
        })
      } catch (e: any) {
        this.ctx.logger.error('发送消息失败:', e)
        res.status(500).json({ success: false, message: '发送消息失败', error: e.message })
      }
    })

    // 上传图片
    this.app.post('/api/webqq/upload', this.upload.single('image'), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ success: false, message: '没有上传文件' })
          return
        }

        res.json({
          success: true,
          data: {
            imagePath: req.file.path,
            filename: req.file.filename
          }
        })
      } catch (e: any) {
        this.ctx.logger.error('上传图片失败:', e)
        res.status(500).json({ success: false, message: '上传图片失败', error: e.message })
      }
    })

    // 获取群成员列表
    this.app.get('/api/webqq/members', async (req, res) => {
      try {
        const { groupCode } = req.query as { groupCode: string }

        if (!groupCode) {
          res.status(400).json({ success: false, message: '缺少群号参数' })
          return
        }

        const result = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
        const members: any[] = []

        if (result?.result?.infos) {
          for (const [uid, member] of result.result.infos) {
            const role = member.role === 4 ? 'owner' : member.role === 3 ? 'admin' : 'member'
            members.push({
              uid: member.uid,
              uin: member.uin,
              nickname: member.nick,
              card: member.cardName || '',
              avatar: `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=640`,
              role
            })
          }
        }

        // 按角色排序：群主 > 管理员 > 成员
        const roleOrder = { owner: 0, admin: 1, member: 2 }
        members.sort((a, b) => roleOrder[a.role as keyof typeof roleOrder] - roleOrder[b.role as keyof typeof roleOrder])

        res.json({ success: true, data: members })
      } catch (e: any) {
        this.ctx.logger.error('获取群成员失败:', e)
        res.status(500).json({ success: false, message: '获取群成员失败', error: e.message })
      }
    })

    // 获取用户信息（通过 uid）- 保留兼容，后续可删除
    this.app.get('/api/webqq/user-info', async (req, res) => {
      try {
        const { uid } = req.query as { uid: string }

        if (!uid) {
          res.status(400).json({ success: false, message: '缺少 uid 参数' })
          return
        }

        const userInfo = await this.ctx.ntUserApi.getUserSimpleInfo(uid, false)
        const uin = await this.ctx.ntUserApi.getUinByUid(uid)
        
        res.json({
          success: true,
          data: {
            uid: userInfo.uid,
            uin: uin || '',
            nickname: userInfo.coreInfo?.nick || '',
            remark: userInfo.coreInfo?.remark || ''
          }
        })
      } catch (e: any) {
        this.ctx.logger.error('获取用户信息失败:', e)
        res.status(500).json({ success: false, message: '获取用户信息失败', error: e.message })
      }
    })

    // 通用 NT API 调用接口
    this.app.post('/api/webqq/nt-call', async (req, res) => {
      try {
        const { service, method, args } = req.body as {
          service: string
          method: string
          args: any[]
        }

        if (!service || !method) {
          res.status(400).json({ success: false, message: '缺少 service 或 method 参数' })
          return
        }

        // 白名单：只允许调用特定的服务
        const allowedServices: Record<string, any> = {
          'ntUserApi': this.ctx.ntUserApi,
          'ntGroupApi': this.ctx.ntGroupApi,
          'ntFriendApi': this.ctx.ntFriendApi,
          'ntFileApi': this.ctx.ntFileApi,
        }

        const serviceInstance = allowedServices[service]
        if (!serviceInstance) {
          res.status(400).json({ success: false, message: `不支持的服务: ${service}` })
          return
        }

        const methodFunc = serviceInstance[method]
        if (typeof methodFunc !== 'function') {
          res.status(400).json({ success: false, message: `服务 ${service} 没有方法: ${method}` })
          return
        }

        const result = await methodFunc.apply(serviceInstance, args || [])
        
        // 处理 Map 类型的返回值
        const serializedResult = this.serializeResult(result)
        
        res.json({ success: true, data: serializedResult })
      } catch (e: any) {
        this.ctx.logger.error('NT API 调用失败:', e)
        res.status(500).json({ success: false, message: 'NT API 调用失败', error: e.message })
      }
    })

    // SSE 实时消息推送
    this.app.get('/api/webqq/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      res.write(`event: connected\ndata: {}\n\n`)

      this.sseClients.add(res)

      req.on('close', () => {
        this.sseClients.delete(res)
      })
    })

    // 图片代理接口 - 解决跨域和 Referer 问题
    this.app.get('/api/webqq/image-proxy', async (req: Request, res: Response) => {
      try {
        const urlParam = req.query.url as string
        if (!urlParam) {
          res.status(400).json({ success: false, message: '缺少图片URL参数' })
          return
        }

        // URL 解码
        let url = decodeURIComponent(urlParam)
        this.ctx.logger.info('图片代理请求:', url)

        // 验证 URL 是否是 QQ 图片服务器
        let parsedUrl: URL
        try {
          parsedUrl = new URL(url)
        } catch (e) {
          res.status(400).json({ success: false, message: '无效的URL' })
          return
        }

        const allowedHosts = ['gchat.qpic.cn', 'multimedia.nt.qq.com.cn', 'c2cpicdw.qpic.cn', 'p.qlogo.cn', 'q1.qlogo.cn']
        if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
          res.status(403).json({ success: false, message: '不允许代理此域名的图片' })
          return
        }

        // 如果 URL 没有 rkey，尝试添加
        if (!url.includes('rkey=') && (parsedUrl.hostname.includes('multimedia.nt.qq.com.cn') || parsedUrl.hostname.includes('gchat.qpic.cn'))) {
          try {
            const appid = parsedUrl.searchParams.get('appid')
            if (appid && ['1406', '1407'].includes(appid)) {
              const rkeyData = await this.ctx.ntFileApi.rkeyManager.getRkey()
              const rkey = appid === '1406' ? rkeyData.private_rkey : rkeyData.group_rkey
              if (rkey) {
                url = url + rkey
                this.ctx.logger.info('已添加 rkey 到图片 URL')
              }
            }
          } catch (e) {
            this.ctx.logger.warn('添加 rkey 失败:', e)
          }
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          }
        })

        if (!response.ok) {
          this.ctx.logger.warn('图片代理请求失败:', response.status, response.statusText)
          res.status(response.status).json({ success: false, message: `获取图片失败: ${response.statusText}` })
          return
        }

        const contentType = response.headers.get('content-type') || 'image/png'
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'public, max-age=86400') // 缓存1天
        res.setHeader('Access-Control-Allow-Origin', '*')

        const buffer = await response.arrayBuffer()
        res.send(Buffer.from(buffer))
      } catch (e: any) {
        this.ctx.logger.error('图片代理失败:', e)
        res.status(500).json({ success: false, message: '图片代理失败', error: e.message })
      }
    })
  }

  // 辅助方法：提取摘要内容
  private extractAbstractContent(abstractContent: any[]): string {
    if (!abstractContent || abstractContent.length === 0) return ''
    return abstractContent.map(item => {
      if (item.type === 'text') return item.content || ''
      if (item.type === 'pic') return '[图片]'
      if (item.type === 'face') return '[表情]'
      return ''
    }).join('')
  }

  // 辅助方法：创建图片消息元素
  private async createPicElement(imagePath: string) {
    try {
      return await SendElement.pic(this.ctx, imagePath)
    } catch (e) {
      this.ctx.logger.error('创建图片元素失败:', e)
      return null
    }
  }

  // 序列化结果，处理 Map 等特殊类型
  private serializeResult(result: any): any {
    if (result === null || result === undefined) return result
    if (result instanceof Map) {
      const obj: Record<string, any> = {}
      for (const [key, value] of result) {
        obj[String(key)] = this.serializeResult(value)
      }
      return obj
    }
    if (Array.isArray(result)) {
      return result.map(item => this.serializeResult(item))
    }
    if (typeof result === 'object') {
      const obj: Record<string, any> = {}
      for (const [key, value] of Object.entries(result)) {
        obj[key] = this.serializeResult(value)
      }
      return obj
    }
    return result
  }

  // 广播消息到所有 SSE 客户端
  public broadcastMessage(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of this.sseClients) {
      client.write(message)
    }
  }

  // 设置消息事件监听
  private setupMessageListener() {
    this.ctx.logger.info('WebQQ: 设置消息事件监听')
    
    // 监听新消息事件 - 直接推送原始 RawMessage
    this.ctx.on('nt/message-created', async (message: RawMessage) => {
      if (this.sseClients.size === 0) return
      
      // 补充 peerUin（私聊时可能为空或为 0）
      if (message.chatType === ChatType.C2C && (!message.peerUin || message.peerUin === '0') && message.peerUid) {
        const uin = await this.ctx.ntUserApi.getUinByUid(message.peerUid)
        if (uin) {
          message.peerUin = uin
        }
      }
      
      this.broadcastMessage('message', {
        type: 'message-created',
        data: message
      })
    })
    
    // 监听自己发送的消息 - 直接推送原始 RawMessage
    this.ctx.on('nt/message-sent', async (message: RawMessage) => {
      this.ctx.logger.info('WebQQ: 收到 nt/message-sent 事件, sseClients:', this.sseClients.size)
      if (this.sseClients.size === 0) return
      
      // 补充 peerUin（私聊时可能为空或为 0）
      if (message.chatType === ChatType.C2C && (!message.peerUin || message.peerUin === '0') && message.peerUid) {
        const uin = await this.ctx.ntUserApi.getUinByUid(message.peerUid)
        if (uin) {
          message.peerUin = uin
        }
      }
      
      this.ctx.logger.info('WebQQ SSE 推送自己发送的消息:', {
        msgId: message.msgId,
        chatType: message.chatType,
        peerUin: message.peerUin,
        peerUid: message.peerUid,
        senderUin: message.senderUin,
        elementsCount: message.elements?.length
      })
      this.broadcastMessage('message', {
        type: 'message-sent',
        data: message
      })
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

