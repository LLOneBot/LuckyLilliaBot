import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createLoginRoutes } from '@/webui/BE/routes/login'

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
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/login-info')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.uid).toBe('test-uid')
    })
  })
})
