import { Router, Request, Response } from 'express'
import { Context } from 'cordis'
import multer from 'multer'
import { createMessagesRoutes } from './messages'
import { createUploadRoutes } from './upload'
import { createProxyRoutes } from './proxy'
import { createMembersRoutes } from './members'
import { createNtCallRoutes } from './ntcall'
import { serializeResult } from '../../utils'

export interface WebQQRoutesOptions {
  upload: multer.Multer
  fileUpload: multer.Multer
  uploadDir: string
  sseClients: Set<Response>
  createPicElement: (imagePath: string) => Promise<any>
}

export function createWebQQRoutes(ctx: Context, options: WebQQRoutesOptions): Router {
  const router = Router()
  const { upload, fileUpload, uploadDir, sseClients, createPicElement } = options

  // 消息相关路由
  router.use(createMessagesRoutes(ctx, createPicElement))

  // 上传相关路由
  router.use(createUploadRoutes(ctx, upload, fileUpload, uploadDir))

  // 代理相关路由
  router.use(createProxyRoutes(ctx))

  // 群成员和用户信息路由
  router.use(createMembersRoutes(ctx))

  // SSE 实时消息推送
  router.get('/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    res.write(`event: connected\ndata: {}\n\n`)

    sseClients.add(res)

    req.on('close', () => {
      sseClients.delete(res)
    })
  })

  return router
}

export { createNtCallRoutes }
