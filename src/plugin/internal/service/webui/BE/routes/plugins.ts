import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'cordis'
import { Context as HonoContext, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  PluginConfigError, PluginForbiddenError, PluginNotFoundError, PluginRevConflictError, PluginTrustRequiredError, UiPrefsPatch,
} from '../../../../../host'
import { checkToken } from '../auth'

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
      if (e instanceof PluginTrustRequiredError) return c.json({ success: false, message, data: { package: e.pkg } }, 428)
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
    const disposeUi = ctx.on('plugins/ui', (prefs) => {
      stream.writeSSE({ event: 'changed', data: JSON.stringify({ type: 'ui', data: prefs }) })
    })
    stream.onAbort(() => {
      dispose()
      disposeUi()
    })
    await stream.writeSSE({ event: 'connected', data: '{}' })
    await new Promise<void>(resolve => stream.onAbort(resolve))
  }))

  router.post('/scan', c => respond(c, () => ctx.plugins.scan()))
  router.get('/directories', c => respond(c, () => ({ roots: ctx.plugins.config.roots.map(root => path.resolve(root)) })))

  router.get('/ui', c => respond(c, () => ctx.plugins.uiPrefs()))
  router.patch('/ui', async (c) => {
    const patch = await c.req.json<UiPrefsPatch>()
    return respond(c, () => ctx.plugins.updateUiPrefs(patch && typeof patch === 'object' ? patch : {}))
  })

  router.post('/', async (c) => {
    const { name, config, trust } = await c.req.json<{ name: string; config?: unknown; trust?: boolean }>()
    return respond(c, () => ctx.plugins.add(name, config, { trust: trust === true }))
  })

  router.put('/order', async (c) => {
    const { order } = await c.req.json<{ order: unknown }>()
    return respond(c, () => ctx.plugins.setMessageOrder(order))
  })

  router.delete('/:id', c => respond(c, () => ctx.plugins.remove(c.req.param('id'))))
  router.post('/:id/enable', async (c) => {
    const body = await c.req.json<{ trust?: boolean }>().catch(() => ({} as { trust?: boolean }))
    return respond(c, () => ctx.plugins.enable(c.req.param('id'), { trust: body?.trust === true }))
  })
  router.post('/:id/disable', c => respond(c, () => ctx.plugins.disable(c.req.param('id'))))
  router.post('/:id/reload', c => respond(c, () => ctx.plugins.reload(c.req.param('id'))))
  router.get('/:id/schema', c => respond(c, () => ctx.plugins.describe(c.req.param('id'))))
  router.get('/:id/dependencies', c => respond(c, () => ctx.plugins.dependencies(c.req.param('id'))))
  router.get('/:id/details', c => respond(c, () => ctx.plugins.details(c.req.param('id'))))
  router.delete('/:id/listener-error', c => respond(c, () => ctx.plugins.clearListenerError(c.req.param('id'))))

  router.put('/:id/scope', async (c) => {
    const { scope } = await c.req.json<{ scope: unknown }>()
    return respond(c, () => ctx.plugins.setScope(c.req.param('id'), scope))
  })

  router.put('/:id/config', async (c) => {
    const { config, ifRev, clear } = await c.req.json<{ config: unknown; ifRev?: string; clear?: string[] }>()
    return respond(c, () => ctx.plugins.updateConfig(c.req.param('id'), config, ifRev, clear))
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
 * The WebUI keeps its login under a per-port cookie name (FE/utils/api.ts `tokenCookieName`): cookies ignore the
 * port while every instance on a machine has its own password. The port is the one the browser used, i.e. the
 * Host header's, defaulting by scheme like the browser does.
 */
function loginCookie(request: Request): string | undefined {
  const host = request.headers.get('host') ?? ''
  const port = /:(\d+)$/.exec(host)?.[1] ?? (new URL(request.url).protocol === 'https:' ? '443' : '80')
  return cookie(request, `webui_token_${port}`)
}

/** What @hono/node-server hands a handler: the connection, for the address the access log names. */
type ServerEnv = { incoming?: { socket?: { remoteAddress?: string } } } | undefined

type Resolve = (key: string, file: string) => string | undefined

/**
 * `/<route>/<key>/<version>/<file>`, a file of a plugin package. import() and <img> send the cookies but no headers,
 * so the WebUI login is checked against its cookie, which holds the same hash, with the API's lockout.
 */
async function servePackageFile(request: Request, env: ServerEnv, resolve: Resolve, headers: Record<string, string> = {}): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  const { pathname } = new URL(request.url)
  const ip = env?.incoming?.socket?.remoteAddress ?? ''
  if (checkToken(loginCookie(request), ip, request.method, pathname)) return new Response(null, { status: 401 })
  const [, , key, , ...file] = pathname.split('/')
  let target: string | undefined
  try {
    target = key && file.length ? resolve(decodeURIComponent(key), file.map(decodeURIComponent).join('/')) : undefined
  } catch {
    // Malformed percent-encoding
  }
  const info = target ? await stat(target).catch(() => undefined) : undefined
  if (!target || !info?.isFile()) return new Response(null, { status: 404 })
  const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`
  // The URL carries a version, but a plugin being edited changes without one
  const common = { 'Cache-Control': 'no-cache', ETag: etag, ...headers }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: common })
  return new Response(request.method === 'HEAD' ? null : await readFile(target), {
    headers: { 'Content-Type': CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream', ...common },
  })
}

/** `/plugin-webui/...`: plugin WebUI modules and their chunks, served to the logged-in WebUI. */
export function servePluginAsset(ctx: Context, request: Request, env?: ServerEnv): Promise<Response> {
  return servePackageFile(request, env, (key, file) => ctx.plugins.webuiAsset(key, file))
}

/** `/plugin-assets/...`: the images of a package, its icon, screenshots and what its details show */
export function servePluginImage(ctx: Context, request: Request, env?: ServerEnv): Promise<Response> {
  return servePackageFile(request, env, (key, file) => ctx.plugins.asset(key, file), {
    // An SVG opened on its own is a document, and would run its scripts with the WebUI's origin
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  })
}

/** Serves /api/plugins through the WebUI's runtime route table, so it is up as soon as both services are. */
export const PluginRoutes = {
  name: 'webui-plugin-routes',
  inject: ['webuiServer', 'plugins'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/plugins', new Hono().route('/api/plugins', createPluginRoutes(ctx)))
    ctx.webuiServer.route('/plugin-webui', { fetch: (request, env) => servePluginAsset(ctx, request, env as ServerEnv) }, { public: true })
    ctx.webuiServer.route('/plugin-assets', { fetch: (request, env) => servePluginImage(ctx, request, env as ServerEnv) }, { public: true })
  },
}
