import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { isPmhqMode } from '@/common/utils/environment'
import { Hono } from 'hono'

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
      return c.json({ success: false, message: 'PMHQ 模式暂不支持退出 QQ' }, 400)
    }
    try {
      await ctx.qqProtocol.logout()
      return c.json({ success: true })
    } catch (e) {
      return c.json({ success: false, message: (e as Error).message || '退出登录失败' }, 500)
    }
  })

  // 带上生效的 WebUI 配置: FE 据此判断 WebUI 是否被关掉或换了端口
  router.get('/login-info', (c) => {
    let webui: { enable: boolean; host: string; port: number } | undefined
    if (selfInfo.online && selfInfo.uin) {
      const effective = ctx.config.get().webui
      if (effective) {
        webui = {
          enable: effective.enable !== false,
          host: effective.host ?? '',
          port: Number(effective.port) || 0,
        }
      }
    }
    return c.json({ success: true, data: { ...selfInfo, mode: isPmhqMode() ? 'pmhq' : 'direct', webui } })
  })

  return router
}
