import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Hono } from 'hono'

export function createLoginRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 获取登录二维码
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

  // 获取快速登录账号列表
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

  // 快速登录: 用指定 uin 从 data/qq-session-<uin>.json 恢复 (Direct 模式).
  // 结果由 FE 后续轮询 /api/login-info 的 online 字段判定, 这里只负责触发.
  router.post('/quick-login', async (c) => {
    const { uin } = await c.req.json()
    if (!uin) {
      return c.json({ success: false, message: '没有选择QQ号' }, 400)
    }
    try {
      await ctx.qqProtocol.quickLogin(String(uin))
      // FE 现有代码 (QQLogin.tsx) 会检查 data.result === '0' 判成功, 保持兼容
      return c.json({ success: true, data: { result: '0', loginErrorInfo: { errMsg: '' } } })
    } catch (e) {
      return c.json({
        success: false,
        message: (e as Error).message || '快速登录失败',
        data: { result: '-1', loginErrorInfo: { errMsg: (e as Error).message || '快速登录失败' } },
      }, 500)
    }
  })

  // 获取账号信息
  router.get('/login-info', (c) => {
    return c.json({ success: true, data: selfInfo })
  })

  return router
}
