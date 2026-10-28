import { rmSync } from 'node:fs'
import { Context, Service } from 'cordis'
import { Hono } from 'hono'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_DIR } from '@/common/globalVars'
import { hashPassword } from '@/webui/BE/passwordHash'
import { WebuiServer } from '@/webui/BE/server'

// WebuiServer creates its upload dir and access log under these; keep them out of the repo and /tmp
vi.mock('@/common/globalVars', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llbot-route-table-'))
  fs.mkdirSync(path.join(dir, 'logs'))
  return {
    DATA_DIR: dir,
    TEMP_DIR: path.join(dir, 'temp'),
    LOG_DIR: path.join(dir, 'logs'),
    dbDir: path.join(dir, 'database'),
    selfInfo: { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true },
    authTokenStatus: { hasToken: false, validation: 'idle', message: '', loginError: '' },
    getFixedDataDir: () => dir,
  }
})

class Stub extends Service {}

const env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } }
// test/unit/setup.ts mocks the WebUI password to 'test-token'
const authorized = { 'X-Webui-Token': hashPassword('test-token') }

let ctx: Context
let app: Hono

function request(path: string, init: RequestInit = {}, headers: Record<string, string> = authorized) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { ...headers, ...init.headers } }), env)
}

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

beforeEach(async () => {
  ctx = new Context()
  // The shell needs nothing but the settings
  await ctx.plugin(class extends Stub {
    constructor(ctx: Context) { super(ctx, 'config') }
    get() { return { webui: { enable: false, host: '127.0.0.1', port: 0 } } }
  })
  await ctx.plugin(WebuiServer)
  app = (ctx.webuiServer as unknown as { app: Hono }).app
})

describe('WebuiServer.route', () => {
  it('serves a mounted handler until the plugin that mounted it goes away', async () => {
    const demo = new Hono().basePath('/api/demo')
    demo.get('/', c => c.text('ok'))
    demo.post('/echo', async c => c.text(await c.req.text()))
    demo.post('/upload', async (c) => {
      const body = await c.req.parseBody()
      return c.text((body.file as File).name)
    })
    const plugin = await ctx.plugin({ inject: ['webuiServer'], apply: (ctx: Context) => { ctx.webuiServer.route('/api/demo/', demo) } })

    expect(await (await request('/api/demo')).text()).toBe('ok')
    expect(await (await request('/api/demo/echo', { method: 'POST', body: 'payload' })).text()).toBe('payload')
    const form = new FormData()
    form.append('file', new File(['x'], 'pic.png'))
    expect(await (await request('/api/demo/upload', { method: 'POST', body: form })).text()).toBe('pic.png')
    expect((await request('/api/demo', {}, {})).status).toBe(403)
    expect(() => ctx.webuiServer.route('/api/demo', demo)).toThrow(/already mounted/)

    await plugin.dispose()
    const gone = await request('/api/demo')
    expect(gone.status).toBe(404)
    expect(await gone.json()).toMatchObject({ success: false })
  })

  it('never shadows a built-in route', async () => {
    const hijack = new Hono().all('*', c => c.text('hijacked'))
    await ctx.plugin({ inject: ['webuiServer'], apply: (ctx: Context) => { ctx.webuiServer.route('/api/config', hijack) } })
    expect(await (await request('/api/config')).text()).not.toBe('hijacked')
    expect(await (await request('/api/config/extra')).text()).toBe('hijacked')
  })

  it('serves public routes outside /api without the login, and keeps the two apart', async () => {
    const hook = { fetch: () => new Response('public') }
    const plugin = await ctx.plugin({ inject: ['webuiServer'], apply: (ctx: Context) => { ctx.webuiServer.route('/hooks', hook, { public: true }) } })
    expect(await (await request('/hooks/github', {}, {})).text()).toBe('public')
    expect(() => ctx.webuiServer.route('/api/hooks', hook, { public: true })).toThrow('must not be under /api')
    expect(() => ctx.webuiServer.route('/hooks2', hook)).toThrow('must be under /api')

    await plugin.dispose()
    expect((await request('/hooks/github', {}, {})).status).toBe(404)
  })
})
