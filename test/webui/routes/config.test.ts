import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createConfigRoutes } from '@/webui/BE/routes/config'

vi.mock('@/main/config', () => ({
  webuiTokenUtil: {
    getToken: vi.fn(() => 'test-token'),
    setToken: vi.fn(),
  },
  getConfigUtil: vi.fn(() => ({
    getConfig: vi.fn(() => ({
      ob11: { enable: false, connect: [] },
      satori: { enable: false },
      milky: { enable: false },
      webui: { enable: true, host: '0.0.0.0', port: 3080 },
    })),
    setConfig: vi.fn(),
  })),
}))

import { webuiTokenUtil } from '@/main/config'

describe('config routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('GET /network-interfaces', () => {
    it('returns list of IPv4 addresses', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/network-interfaces')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(Array.isArray(body.data)).toBe(true)
    })
  })

  describe('POST /set-token', () => {
    it('returns 400 when token is empty', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '' }),
      })
      expect(res.status).toBe(400)
    })

    it('sets token and returns success', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'new-password' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(vi.mocked(webuiTokenUtil.setToken)).toHaveBeenCalledWith('new-password')
    })
  })

  describe('GET /config', () => {
    it('returns current config and selfInfo', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/config')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.selfInfo).toBeDefined()
      expect(body.data.config).toBeDefined()
    })
  })

  describe('POST /config', () => {
    it('saves config successfully', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ob11: { enable: false, connect: [] } } }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(ctx.parallel).toHaveBeenCalled()
    })

    it('returns 400 when Satori listens on 0.0.0.0 without token', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            satori: { enable: true, host: '0.0.0.0', token: '' },
          },
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('Satori')
    })

    it('returns 400 when OB11 WS listens on 0.0.0.0 without token', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ob11: {
              enable: true,
              connect: [{ enable: true, type: 'ws', host: '0.0.0.0', token: '' }],
            },
          },
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('OneBot11')
    })

    it('returns 400 when Milky HTTP listens on all interfaces without token', async () => {
      const app = createTestApp(createConfigRoutes(ctx))
      const res = await app.request('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            milky: { enable: true, http: { host: '', accessToken: '' } },
          },
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('Milky')
    })

    // The check runs on the deep-merged result that patch() writes, not a shallow spread
    const post = (app: ReturnType<typeof createTestApp>, config: object) => app.request('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })

    it('accepts enabling Satori when the stored host is loopback', async () => {
      ctx.config.get.mockReturnValue({ satori: { enable: false, host: '127.0.0.1', token: '' } })
      const res = await post(createTestApp(createConfigRoutes(ctx)), { satori: { enable: true } })
      expect(res.status).toBe(200)
    })

    it('rejects clearing the token of an already-public Satori listener', async () => {
      ctx.config.get.mockReturnValue({ satori: { enable: true, host: '', token: 'abc' } })
      const res = await post(createTestApp(createConfigRoutes(ctx)), { satori: { token: '' } })
      expect(res.status).toBe(400)
      expect(ctx.config.patch).not.toHaveBeenCalled()
    })

    it('does not let a bad section the request did not touch block the save', async () => {
      ctx.config.get.mockReturnValue({ satori: { enable: true, host: '', token: '' }, log: true })
      const res = await post(createTestApp(createConfigRoutes(ctx)), { log: false })
      expect(res.status).toBe(200)
    })
  })

  describe('GET /config', () => {
    it('reports the fields an environment variable pins', async () => {
      ctx.config.envLocks.mockReturnValue([{ path: 'webui.port', env: 'LLBOT_WEBUI_PORT' }])
      const res = await createTestApp(createConfigRoutes(ctx)).request('/config')
      const body = await res.json()
      expect(body.data.envLocked).toEqual([{ path: 'webui.port', env: 'LLBOT_WEBUI_PORT' }])
    })
  })
})
