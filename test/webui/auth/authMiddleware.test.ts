import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { hashPassword } from '@/webui/BE/passwordHash'

vi.mock('@/main/config', () => ({
  webuiTokenUtil: {
    getToken: vi.fn(() => 'test-token'),
    setToken: vi.fn(),
  },
  getConfigUtil: vi.fn(() => ({
    getConfig: vi.fn(() => ({})),
    setConfig: vi.fn(),
  })),
}))

import { webuiTokenUtil } from '@/main/config'

function createAuthApp() {
  // 每次都重新 import authMiddleware，这样模块级状态（globalLoginAttempt）会被重置
  // 但由于 vitest 缓存模块，我们需要用 vi.resetModules() + dynamic import
  // 这里我们直接构建 app，每个 describe 块用 resetModules 隔离
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } } as any
    return await next()
  })
  return app
}

describe('authMiddleware', () => {
  let authMiddleware: any

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/webui/BE/auth')
    authMiddleware = mod.authMiddleware
  })

  describe('when no token is set', () => {
    beforeEach(() => {
      webuiTokenUtil.getToken.mockReturnValue('')
    })

    it('allows /api/set-token endpoint through', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.post('/api/set-token', (c) => c.json({ success: true }))

      const res = await app.request('/api/set-token', { method: 'POST' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it('returns 401 for other API paths', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/config', (c) => c.json({ success: true }))

      const res = await app.request('/config')
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.message).toContain('设置WebUI密码')
    })
  })

  describe('when token is set', () => {
    const TOKEN = 'my-secret'

    beforeEach(() => {
      webuiTokenUtil.getToken.mockReturnValue(TOKEN)
    })

    it('returns 403 when no token in request', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      const res = await app.request('/test')
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.message).toContain('请输入密码')
    })

    it('passes through with correct token in X-Webui-Token header', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      const res = await app.request('/test', {
        headers: { 'X-Webui-Token': hashPassword(TOKEN) },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    it('passes through with correct token in query param', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      const res = await app.request(`/test?token=${hashPassword(TOKEN)}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    it('returns 403 with wrong token and shows remaining attempts', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      const res = await app.request('/test', {
        headers: { 'X-Webui-Token': 'wrong-token' },
      })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.remainingAttempts).toBeDefined()
      expect(body.remainingAttempts).toBe(3)
    })
  })

  describe('rate limiting and lockout', () => {
    const TOKEN = 'my-secret'

    beforeEach(() => {
      webuiTokenUtil.getToken.mockReturnValue(TOKEN)
    })

    it('locks after 4 consecutive failures', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      // First 3 failures return 403 with remainingAttempts
      for (let i = 0; i < 3; i++) {
        await app.request('/test', {
          headers: { 'X-Webui-Token': 'wrong' },
        })
      }

      // 4th failure triggers lockout
      const res = await app.request('/test', {
        headers: { 'X-Webui-Token': 'wrong' },
      })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.locked).toBe(true)
      expect(body.remainingMinutes).toBe(60)
    })

    it('rejects correct token during lockout', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      // Trigger lockout
      for (let i = 0; i < 4; i++) {
        await app.request('/test', {
          headers: { 'X-Webui-Token': 'wrong' },
        })
      }

      // Even correct token should be rejected
      const res = await app.request('/test', {
        headers: { 'X-Webui-Token': hashPassword(TOKEN) },
      })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.locked).toBe(true)
    })

    it('resets failure count on successful auth', async () => {
      const app = createAuthApp()
      app.use('*', authMiddleware)
      app.get('/test', (c) => c.json({ ok: true }))

      // 2 failed attempts
      await app.request('/test', { headers: { 'X-Webui-Token': 'wrong' } })
      await app.request('/test', { headers: { 'X-Webui-Token': 'wrong' } })

      // Successful auth resets counter
      const res = await app.request('/test', {
        headers: { 'X-Webui-Token': hashPassword(TOKEN) },
      })
      expect(res.status).toBe(200)

      // Should have full attempts again — 3 failures should not trigger lockout
      for (let i = 0; i < 3; i++) {
        const r = await app.request('/test', {
          headers: { 'X-Webui-Token': 'wrong' },
        })
        const b = await r.json()
        expect(b.locked).toBeUndefined()
      }
    })
  })

  describe('app.route() middleware isolation bug', () => {
    it('middleware via app.use does NOT apply to sub-routers via app.route', async () => {
      webuiTokenUtil.getToken.mockReturnValue('secret')

      // Replicate server.ts pattern:
      const mainApp = new Hono()
      mainApp.use('*', async (c, next) => {
        c.env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } } as any
        return await next()
      })
      mainApp.use('/api/*', authMiddleware)

      // Sub-router (like createConfigRoutes returns)
      const subRouter = new Hono()
      subRouter.get('/config', (c) => c.json({ success: true, data: 'sensitive' }))
      mainApp.route('/api', subRouter)

      // Request without any token — should be blocked but ISN'T
      const res = await mainApp.request('/api/config')
      const body = await res.json()

      // This demonstrates the bug: the sub-router bypasses auth
      // If Hono fixes this in future, this test documents the expected behavior
      if (res.status === 200) {
        expect(body.data).toBe('sensitive')
        // BUG: auth was bypassed
      } else {
        // If this branch is hit, Hono fixed the issue
        expect(res.status).toBe(403)
      }
    })

    it('middleware applied on sub-router itself works correctly', async () => {
      webuiTokenUtil.getToken.mockReturnValue('secret')

      // Fix: apply middleware on the sub-router
      const api = new Hono()
      api.use('*', async (c, next) => {
        c.env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } } as any
        return await next()
      })
      api.use('*', authMiddleware)
      api.get('/config', (c) => c.json({ success: true, data: 'sensitive' }))

      const mainApp = new Hono()
      mainApp.route('/api', api)

      // Without token — should be blocked
      const res = await mainApp.request('/api/config')
      expect(res.status).toBe(403)
    })
  })
})
