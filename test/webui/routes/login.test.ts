import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createLoginRoutes } from '@/plugin/internal/protocol/nt-protocol/loginRoutes'
import { createLoginInfoRoutes } from '@/plugin/internal/protocol/nt-protocol/loginInfoRoutes'
import { isNativeQQMode, launchPins, lockedProtocol } from '@/common/utils/environment'
import { QuickLoginUnsupportedError } from '@/plugin/internal/protocol/nt-protocol/qqProtocol/base'

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
    it.each([
      { error: new QuickLoginUnsupportedError('请更新原生包'), status: 501 },
      { error: new Error('QQ 登录服务暂时不可用'), status: 500 },
    ])('distinguishes unsupported login from a temporary error: $status', async ({ error, status }) => {
      ctx.ntLoginApi.getQuickLoginList.mockRejectedValue(error)
      const res = await createTestApp(createLoginRoutes(ctx)).request('/quick-login-list')
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ success: false, message: error.message })
    })

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
    it('returns success after the protocol finishes logging in', async () => {
      const completed = Promise.withResolvers<void>()
      ctx.qqProtocol.quickLogin = vi.fn(() => completed.promise)
      const request = createTestApp(createLoginRoutes(ctx)).request('/quick-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uin: '123456' }),
      })
      let responded = false
      void request.then(() => { responded = true })
      await vi.waitFor(() => expect(ctx.qqProtocol.quickLogin).toHaveBeenCalledWith('123456'))
      expect(responded).toBe(false)
      completed.resolve()
      const res = await request
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ success: true, data: { result: '0' } })
    })

    it('returns 400 when uin is missing', async () => {
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it.each([
      { error: new Error('QQ 登录票据已失效'), status: 500 },
      { error: new QuickLoginUnsupportedError('请更新原生包'), status: 501 },
    ])('preserves the quick login error: $status', async ({ error, status }) => {
      ctx.qqProtocol.quickLogin = vi.fn().mockRejectedValue(error)
      const app = createTestApp(createLoginRoutes(ctx))

      const res = await app.request('/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uin: '123456' }),
      })
      expect(res.status).toBe(status)
      const body = await res.json()
      expect(body).toEqual({
        success: false, message: error.message,
        data: { result: '-1', loginErrorInfo: { errMsg: error.message } },
      })
    })
  })

  describe('POST /nativeqq/launch', () => {
    const launch = () => createTestApp(createLoginRoutes(ctx)).request('/nativeqq/launch', { method: 'POST' })

    it('starts QQ for the official QQ client bridge only', async () => {
      ctx.qqProtocol.launch = vi.fn(async () => {})
      expect((await launch()).status).toBe(400)
      expect(ctx.qqProtocol.launch).not.toHaveBeenCalled()
      vi.mocked(isNativeQQMode).mockReturnValue(true)
      const res = await launch()
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
      expect(ctx.qqProtocol.launch).toHaveBeenCalledTimes(1)
    })

    it('says why QQ did not start', async () => {
      vi.mocked(isNativeQQMode).mockReturnValue(true)
      ctx.qqProtocol.launch = vi.fn(async () => { throw new Error('QQ 路径不存在') })
      const res = await launch()
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ success: false, message: 'QQ 路径不存在' })
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
      expect(body.data.nativeQQ).toBeUndefined()
    })

    it('tells the bridge whether NativeQQ answers', async () => {
      vi.mocked(isNativeQQMode).mockReturnValue(true)
      ctx.qqProtocol.get_is_connected = vi.fn(() => false)
      const body = await (await createTestApp(createLoginInfoRoutes(ctx)).request('/login-info')).json()
      expect(body.data.mode).toBe('nativeqq')
      expect(body.data.nativeQQ).toEqual({ configPath: '', qqPath: '', connected: false })
    })

    it('passes on what NativeQQ says of the bridge', async () => {
      vi.mocked(isNativeQQMode).mockReturnValue(true)
      const status = { session: 'starting', authTokenSet: false, qqRunning: false, loggedIn: false, qrcodeAvailable: false }
      ctx.qqProtocol.get_is_connected = vi.fn(() => false)
      ctx.qqProtocol.bridgeStatus = vi.fn(async () => status)
      const body = await (await createTestApp(createLoginInfoRoutes(ctx)).request('/login-info')).json()
      expect(body.data.nativeQQ).toEqual({ configPath: '', qqPath: '', connected: false, status })
    })
  })
})
