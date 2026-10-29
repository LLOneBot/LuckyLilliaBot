import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createLoginRoutes } from '@/plugin/internal/protocol/nt-protocol/loginRoutes'
import { createLoginInfoRoutes } from '@/webui/BE/routes/loginInfo'
import { isPmhqMode, launchPins, lockedProtocol } from '@/common/utils/environment'

describe('login routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('GET /login-qrcode', () => {
    it('returns QR code data on success', async () => {
      ctx.ntLoginApi.getLoginQrCode.mockResolvedValue({ url: 'qr-data', expireTime: 120 })
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/login-qrcode')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.url).toBe('qr-data')
    })

    it('returns 500 on API failure', async () => {
      ctx.ntLoginApi.getLoginQrCode.mockRejectedValue(new Error('api error'))
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/login-qrcode')
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.success).toBe(false)
    })
  })

  describe('GET /quick-login-list', () => {
    it('returns account list', async () => {
      ctx.ntLoginApi.getQuickLoginList.mockResolvedValue(['111', '222'])
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/quick-login-list')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual(['111', '222'])
    })
  })

  describe('POST /quick-login', () => {
    it('returns 400 when uin is missing', async () => {
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('returns login result on failure', async () => {
      ctx.ntLoginApi.quickLoginWithUin.mockResolvedValue({
        loginErrorInfo: { errMsg: '' },
      })
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uin: '123456' }),
      })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.success).toBe(false)
    })
  })

  describe('GET /login-info', () => {
    it('returns selfInfo', async () => {
      const app = createTestApp(createLoginInfoRoutes(ctx))

      const res = await app.request('/login-info')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.uid).toBe('test-uid')
    })

    it('says whether the NT protocol runs at all', async () => {
      ctx.get.mockImplementation((key: string) => key === 'qqProtocol' ? undefined : (ctx as Record<string, unknown>)[key])
      const body = await (await createTestApp(createLoginInfoRoutes(ctx)).request('/login-info')).json()
      expect(body.data.ntProtocol).toBe(false)
    })

    it('says how the account logs in and what the launch fixes', async () => {
      vi.mocked(launchPins).mockReturnValue({ protocol: { value: 'macos', by: '--protocol' } })
      vi.mocked(lockedProtocol).mockReturnValue('linux')
      const body = await (await createTestApp(createLoginInfoRoutes(ctx)).request('/login-info')).json()
      expect(body.data).toMatchObject({
        mode: 'direct',
        protocol: 'linux',
        lockedProtocol: 'linux',
        pins: { protocol: { value: 'macos', by: '--protocol' } },
      })
      expect(body.data.pmhq).toBeUndefined()
    })

    it('tells the bridge whether PMHQ answers', async () => {
      vi.mocked(isPmhqMode).mockReturnValue(true)
      ctx.qqProtocol.get_is_connected = vi.fn(() => false)
      const body = await (await createTestApp(createLoginInfoRoutes(ctx)).request('/login-info')).json()
      expect(body.data.mode).toBe('pmhq')
      expect(body.data.pmhq).toEqual({ host: '127.0.0.1', port: '13000', connected: false })
    })
  })
})
