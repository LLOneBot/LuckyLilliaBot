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
  })
})
