import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'cordis'
import { Context as HonoContext, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  ConfigScope, PluginConfigError, PluginForbiddenError, PluginNotFoundError, PluginRevConflictError, PluginUnavailableError,
} from '../../../plugin'
import { webuiTokenUtil } from '../../../main/config'
import { hashPassword } from '../passwordHash'

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
      if (e instanceof PluginRevConflictError) return c.json({ success: false, message, data: { rev: e.rev } }, 409)
      if (e instanceof PluginUnavailableError) return c.json({ success: false, message }, 503)
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
    const { config, scope, ifRev, clear } = await c.req.json<{ config: unknown; scope?: ConfigScope; ifRev?: string; clear?: string[] }>()
    return respond(c, () => ctx.plugins.updateConfig(c.req.param('id'), config, scope, ifRev, clear))
  })

  return router
}

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
}

/**
 * `/plugin-webui/<key>/<version>/<file>`: plugin WebUI modules and their chunks. import() sends the
 * cookies but no headers, so the WebUI login is checked against its cookie, which holds the same hash.
 */
export async function servePluginAsset(ctx: Context, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  const token = webuiTokenUtil.getToken()
  if (!token || cookie(request, 'webui_token') !== hashPassword(token)) return new Response(null, { status: 401 })
  const [, , key, , ...file] = new URL(request.url).pathname.split('/')
  let target: string | undefined
  try {
    target = key && file.length ? ctx.plugins.webuiAsset(decodeURIComponent(key), file.map(decodeURIComponent).join('/')) : undefined
  } catch {
    // malformed percent-encoding
  }
  if (!target || !(await stat(target).catch(() => undefined))?.isFile()) return new Response(null, { status: 404 })
  return new Response(request.method === 'HEAD' ? null : await readFile(target), {
    headers: {
      'Content-Type': CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      // The URL carries the package's reload version, but a plugin being edited without a reload changes too
      'Cache-Control': 'no-cache',
    },
  })
}

/** Serves /api/plugins through the WebUI's runtime route table, so it is up as soon as both services are. */
export const PluginRoutes = {
  name: 'webui-plugin-routes',
  inject: ['webuiServer', 'plugins'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/plugins', new Hono().route('/api/plugins', createPluginRoutes(ctx)))
    ctx.webuiServer.route('/plugin-webui', { fetch: request => servePluginAsset(ctx, request) }, { public: true })
  },
}
