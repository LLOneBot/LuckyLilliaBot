import { Context } from 'cordis'
import { isPmhqMode } from '@/common/utils/environment'
import { Hono } from 'hono'
import { createAuthTokenRoutes } from './authTokenRoutes'

/** QR / quick login and logout of the scanned account; mounted by NTLoginRoutes while the NT protocol runs. */
export function createLoginRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/login-qrcode', async (c) => {
    try {
      const data = await ctx.ntLoginApi.getLoginQrCode()
      return c.json({
        success: true,
        data,
      })
    } catch (e) {
      return c.json({ success: false, message: '获取登录二维码失败', error: e }, 500)
    }
  })

  router.get('/quick-login-list', async (c) => {
    try {
      const data = await ctx.ntLoginApi.getQuickLoginList()
      return c.json({
        success: true,
        data,
      })
    } catch (e) {
      return c.json({ success: false, message: '获取快速登录账号列表失败', error: e }, 500)
    }
  })

  // 只负责触发, 结果由 FE 轮询 /api/login-info 的 online 判断
  router.post('/quick-login', async (c) => {
    const { uin } = await c.req.json()
    if (!uin) {
      return c.json({ success: false, message: '没有选择QQ号' }, 400)
    }
    try {
      await ctx.qqProtocol.quickLogin(String(uin))
      // QQLogin.tsx 用 data.result === '0' 判断成功
      return c.json({ success: true, data: { result: '0', loginErrorInfo: { errMsg: '' } } })
    } catch (e) {
      return c.json({
        success: false,
        message: (e as Error).message || '快速登录失败',
        data: { result: '-1', loginErrorInfo: { errMsg: (e as Error).message || '快速登录失败' } },
      }, 500)
    }
  })

  // PMHQ 模式的登录归外部 QQ 客户端管, 直接拒绝
  router.post('/logout', async (c) => {
    if (isPmhqMode()) {
      return c.json({ success: false, message: '官方 QQ 端桥接的登录由 QQ 客户端管理，不能在这里退出' }, 400)
    }
    try {
      await ctx.qqProtocol.logout()
      return c.json({ success: true })
    } catch (e) {
      return c.json({ success: false, message: (e as Error).message || '退出登录失败' }, 500)
    }
  })

  return router
}

/** The login routes of the scanned account, present only while the NT protocol plugin runs. */
export const NTLoginRoutes = {
  name: 'webui-nt-login-routes',
  inject: ['webuiServer', 'ntLoginApi', 'qqProtocol'],
  apply(ctx: Context) {
    const app = new Hono()
      .route('/api', createLoginRoutes(ctx))
      .route('/api', createAuthTokenRoutes())
    for (const prefix of ['/api/login-qrcode', '/api/quick-login-list', '/api/quick-login', '/api/logout', '/api/auth-token']) {
      ctx.webuiServer.route(prefix, app)
    }
  },
}
