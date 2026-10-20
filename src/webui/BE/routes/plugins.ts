import { Context } from 'cordis'
import { Context as HonoContext, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { PluginConfigError, PluginForbiddenError, PluginNotFoundError } from '../../../plugin'

export function createPluginRoutes(ctx: Context): Hono {
  const router = new Hono()

  const respond = async (c: HonoContext, task: () => Promise<unknown> | unknown) => {
    try {
      return c.json({ success: true, data: (await task()) ?? null })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (e instanceof PluginNotFoundError) return c.json({ success: false, message }, 404)
      if (e instanceof PluginForbiddenError) return c.json({ success: false, message }, 403)
      if (e instanceof PluginConfigError) return c.json({ success: false, message, data: { issues: e.issues } }, 400)
      ctx.logger('webui').warn(e)
      return c.json({ success: false, message }, 500)
    }
  }

  router.get('/', c => respond(c, () => ctx.plugins.list().filter(status => !status.manifest.hidden)))

  router.get('/stream', c => streamSSE(c, async (stream) => {
    const dispose = ctx.on('plugins/changed', (id) => {
      let data: unknown = { type: 'list' }
      if (id !== undefined) {
        try {
          data = { type: 'status', data: ctx.plugins.get(id) }
        } catch {
          // removed right after the change was announced; the list refresh follows
          return
        }
      }
      stream.writeSSE({ event: 'changed', data: JSON.stringify(data) })
    })
    stream.onAbort(() => {
      dispose()
    })
    await stream.writeSSE({ event: 'connected', data: '{}' })
    await new Promise<void>(resolve => stream.onAbort(resolve))
  }))

  router.post('/scan', c => respond(c, () => ctx.plugins.scan()))

  router.post('/', async (c) => {
    const { name, config } = await c.req.json<{ name: string; config?: unknown }>()
    return respond(c, () => ctx.plugins.add(name, config))
  })

  router.delete('/:id', c => respond(c, () => ctx.plugins.remove(c.req.param('id'))))
  router.post('/:id/enable', c => respond(c, () => ctx.plugins.enable(c.req.param('id'))))
  router.post('/:id/disable', c => respond(c, () => ctx.plugins.disable(c.req.param('id'))))
  router.post('/:id/reload', c => respond(c, () => ctx.plugins.reload(c.req.param('id'))))
  router.get('/:id/schema', c => respond(c, () => ctx.plugins.describe(c.req.param('id'))))
  router.get('/:id/dependencies', c => respond(c, () => ctx.plugins.dependencies(c.req.param('id'))))

  router.put('/:id/config', async (c) => {
    const { config } = await c.req.json<{ config: unknown }>()
    return respond(c, () => ctx.plugins.updateConfig(c.req.param('id'), config))
  })

  return router
}

/** Serves /api/plugins through the WebUI's runtime route table, so it is up as soon as both services are. */
export const PluginRoutes = {
  name: 'webui-plugin-routes',
  inject: ['webuiServer', 'plugins'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/plugins', new Hono().route('/api/plugins', createPluginRoutes(ctx)))
  },
}
