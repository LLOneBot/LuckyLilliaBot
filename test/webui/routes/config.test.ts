import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createConfigRoutes } from '@/webui/BE/routes/config'
import { PluginConfigError } from '@/plugin/host'

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
    const post = (config: object) => createTestApp(createConfigRoutes(ctx)).request('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
    // The Satori adapter's entry, switched off, the way the plugin service reports it
    let plugins: Record<string, ReturnType<typeof vi.fn>>
    const calls: string[] = []

    beforeEach(() => {
      calls.length = 0
      plugins = {
        builtinSettings: vi.fn((name: string) => name === 'builtin:satori'
          ? { id: 'sat', enabled: false, config: { host: '127.0.0.1', port: 5600, token: '' } }
          : undefined),
        updateConfig: vi.fn(async () => { calls.push('update') }),
        enable: vi.fn(async () => { calls.push('enable') }),
        disable: vi.fn(async () => { calls.push('disable') }),
      }
      ctx.plugins = plugins
    })

    it('saves the bot settings', async () => {
      const res = await post({ log: false })
      expect(res.status).toBe(200)
      expect(ctx.config.patch).toHaveBeenCalledWith({ log: false })
      expect(ctx.parallel).toHaveBeenCalled()
    })

    it('hands an adapter section to its plugin entry, merged per key, then switches it on', async () => {
      const res = await post({ satori: { enable: true, port: 5700 }, log: false })
      expect(res.status).toBe(200)
      expect(plugins.updateConfig).toHaveBeenCalledWith('sat', { host: '127.0.0.1', port: 5700, token: '' }, undefined, [], {})
      expect(calls).toEqual(['update', 'enable'])
      // the section does not end up in the settings file
      expect(ctx.config.patch).toHaveBeenCalledWith({ log: false })
    })

    it('switches an adapter off before changing it', async () => {
      plugins.builtinSettings.mockReturnValue({ id: 'sat', enabled: true, config: { host: '', port: 5600, token: 'abc' } })
      await post({ satori: { enable: false, token: '' } })
      expect(calls).toEqual(['disable', 'update'])
    })

    it('answers 400 with the reason when the plugin refuses the section', async () => {
      plugins.updateConfig.mockRejectedValue(new PluginConfigError([{ path: ['token'], message: 'Satori 监听全部地址时必须设置 Token' }]))
      const res = await post({ satori: { host: '' }, log: false })
      expect(res.status).toBe(400)
      expect((await res.json()).message).toContain('Satori')
      expect(ctx.config.patch).not.toHaveBeenCalled()
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
