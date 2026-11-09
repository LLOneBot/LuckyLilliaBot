import type { Context } from 'cordis'
import { Hono } from 'hono'
import { QQOfficialSetup, QQSetupError } from './setup'

export function createQQSetupRoutes(setup: QQOfficialSetup): Hono {
  const routes = new Hono()
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  routes.onError((error, c) => error instanceof QQSetupError
    ? c.json({ message: error.message }, error.status)
    : c.json({ message: '扫码配置暂不可用，请重试' }, 500))
  routes.post('/start', c => c.json(setup.start(), 202))
  routes.get('/:id', c => c.json(setup.get(c.req.param('id'))))
  routes.delete('/:id', c => c.json(setup.cancel(c.req.param('id'))))
  return routes
}

/** Kept available while QQOfficial is disabled or waiting for credentials; WebUI provides authentication. */
export const QQSetupRoutes = {
  name: 'webui-qq-official-setup',
  inject: ['webuiServer', 'plugins', 'http', 'timer'],
  apply(ctx: Context) {
    const setup = new QQOfficialSetup(ctx)
    ctx.effect(() => () => setup.dispose())
    const prefix = '/api/qq-official/setup'
    ctx.webuiServer.route(prefix, new Hono().route(prefix, createQQSetupRoutes(setup)))
  },
}
