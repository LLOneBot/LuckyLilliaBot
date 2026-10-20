import { Context } from 'cordis'
import { createMessagesRoutes } from './messages'
import { createUploadRoutes } from './upload'
import { createProxyRoutes } from './proxy'
import { createMembersRoutes } from './members'
import { createNotificationRoutes } from './notifications'
import { createChatsRoutes } from './chats'
import { createActionsRoutes } from './actions'
import { createGroupFilesRoutes } from './groupFiles'
import { forwardEvents } from './events'
import { Hono } from 'hono'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { TEMP_DIR } from '@/common/globalVars'
import { SendElement } from '@/ntqqapi/entities'
import { SendPicElement } from '@/ntqqapi/types'

export interface WebQQRoutesOptions {
  uploadDir: string
  sseClients: Set<SSEStreamingApi>
  createPicElement: (imagePath: string) => Promise<SendPicElement | null>
}

export function createWebQQRoutes(ctx: Context, options: WebQQRoutesOptions): Hono {
  const router = new Hono()
  const { uploadDir, sseClients, createPicElement } = options

  // 消息相关路由
  router.route('/', createMessagesRoutes(ctx, createPicElement))

  // 上传相关路由
  router.route('/', createUploadRoutes(ctx, uploadDir))

  // 代理相关路由
  router.route('/', createProxyRoutes(ctx))

  // 群成员和用户信息路由
  router.route('/', createMembersRoutes(ctx))

  // 通知相关路由（好友申请、群通知）
  router.route('/', createNotificationRoutes(ctx))

  // 列表型查询（friends / groups / pins）
  router.route('/', createChatsRoutes(ctx))

  // 修改型操作（kick / ban / poke / setRole / ...）
  router.route('/', createActionsRoutes(ctx))

  // 群文件（列表 / 上传 / 下载 / 删除 / 文件夹管理）
  router.route('/', createGroupFilesRoutes(ctx))

  // SSE 实时消息推送
  router.get('/events', async (c) => {
    return streamSSE(c, async (stream) => {
      stream.writeSSE({
        data: '{}',
        event: 'connected'
      })
      sseClients.add(stream)
      stream.onAbort(() => {
        sseClients.delete(stream)
      })
      return new Promise((resolve) => {
        stream.onAbort(resolve)
      })
    })
  })

  return router
}

/**
 * The WebQQ backend as the builtin plugin `builtin:webqq`: its routes, upload dir and SSE stream, plus
 * the NT listeners feeding the stream. It only comes up once everything its routes call is there.
 */
export const WebQQ = {
  name: 'webqq',
  inject: ['account', 'webuiServer', 'app', 'store', 'qqProtocol', 'ntMsgApi', 'ntFileApi', 'ntUserApi', 'ntGroupApi', 'ntFriendApi'],
  apply(ctx: Context) {
    const uploadDir = path.join(TEMP_DIR, 'webqq-uploads')
    mkdirSync(uploadDir, { recursive: true })
    const sseClients = new Set<SSEStreamingApi>()
    const createPicElement = async (imagePath: string) => {
      try {
        return await SendElement.pic(ctx, imagePath)
      } catch (e) {
        ctx.logger.error('创建图片元素失败:', e)
        return null
      }
    }
    ctx.webuiServer.route('/api/webqq', new Hono().route('/api/webqq', createWebQQRoutes(ctx, { uploadDir, sseClients, createPicElement })))
    forwardEvents(ctx, sseClients)
    // Pages still connected would otherwise wait on a stream nothing writes to any more
    ctx.effect(() => () => {
      for (const client of sseClients) client.abort()
    })
  },
}
