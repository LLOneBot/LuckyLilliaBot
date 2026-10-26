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

  router.route('/', createMessagesRoutes(ctx, createPicElement))
  router.route('/', createUploadRoutes(ctx, uploadDir))
  router.route('/', createProxyRoutes(ctx))
  router.route('/', createMembersRoutes(ctx))
  router.route('/', createNotificationRoutes(ctx))
  router.route('/', createChatsRoutes(ctx))
  router.route('/', createActionsRoutes(ctx))
  router.route('/', createGroupFilesRoutes(ctx))

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
