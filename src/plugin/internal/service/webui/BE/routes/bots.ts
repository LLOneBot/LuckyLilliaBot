import { Context } from 'cordis'
import { Hono } from 'hono'

/** Part of the WebUI shell: the accounts plugins send through, and whether each is online right now. */
export function createBotsRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/bots', (c) => {
    const bots = ctx.get('bots')
    const data = bots ? [...bots].map((bot) => {
      const user = (bot as { user?: { name?: string; avatar?: string } }).user
      return { sid: bot.sid, platform: bot.platform, selfId: bot.selfId, status: bot.status, name: user?.name, avatar: user?.avatar }
    }) : []
    return c.json({ success: true, data })
  })

  return router
}
