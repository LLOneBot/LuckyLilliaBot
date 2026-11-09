import type { Context } from 'cordis'
import { Hono } from 'hono'
import type { QQOfficialStats } from './stats'

export function createQQOfficialStatsRoutes(read: () => QQOfficialStats): Hono {
  return new Hono().get('/qq-official/stats', c => {
    c.header('Cache-Control', 'no-store')
    return c.json({ success: true, data: read() })
  })
}

/** The bot runs without WebUI; its authenticated stats route follows the optional service's lifetime. */
export function mountQQOfficialStatsRoutes(ctx: Context, read: () => QQOfficialStats) {
  ctx.inject(['webuiServer'], ctx => {
    ctx.webuiServer.route('/api/qq-official/stats', new Hono().route('/api', createQQOfficialStatsRoutes(read)))
  })
}
