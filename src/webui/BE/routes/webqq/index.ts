import { Context } from 'cordis'
import { createMessagesRoutes } from './messages'
import { createUploadRoutes } from './upload'
import { createProxyRoutes } from './proxy'
import { createMembersRoutes } from './members'
import { createNotificationRoutes } from './notifications'
import { createNtCallRoutes } from './ntcall'
import { Hono } from 'hono'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'

export interface WebQQRoutesOptions {
  uploadDir: string
  sseClients: Set<SSEStreamingApi>
  createPicElement: (imagePath: string) => Promise<any>
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

export { createNtCallRoutes }
