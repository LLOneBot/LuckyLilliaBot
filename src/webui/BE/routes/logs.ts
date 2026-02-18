import { Router, Request, Response } from 'express'
import { Context } from 'cordis'
import { getLogCache, LogRecord } from '../../../main/log'

export function createLogsRoutes(ctx: Context): Router {
  const router = Router()

  // SSE 日志流端点
  router.get('/logs/stream', (req: Request, res: Response) => {
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

    const dispose = ctx.on('llob/log', (record: LogRecord) => {
      res.write(`data: ${JSON.stringify(record)}\n\n`)
    })

    req.on('close', () => {
      dispose()
    })
  })

  return router
}
