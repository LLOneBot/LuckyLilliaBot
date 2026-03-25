import { Context } from 'cordis'
import { getLogCache, LogRecord } from '../../../main/log'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

export function createLogsRoutes(ctx: Context): Hono {
  const router = new Hono()

  // SSE 日志流端点
  router.get('/logs/stream', async (c) => {
    return streamSSE(c, async (stream) => {
      // 发送连接确认事件
      stream.writeSSE({
        data: '{}',
        event: 'connected'
      })

      // 先发送历史日志
      for (const record of getLogCache()) {
        stream.writeSSE({
          data: JSON.stringify(record)
        })
      }

      const dispose = ctx.on('llob/log', (record: LogRecord) => {
        stream.writeSSE({
          data: JSON.stringify(record)
        })
      })

      stream.onAbort(() => {
        dispose()
      })

      return new Promise((resolve) => {
        stream.onAbort(resolve)
      })
    })
  })

  return router
}
