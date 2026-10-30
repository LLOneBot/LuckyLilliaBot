import { Context } from 'cordis'
import { Hono } from 'hono'
import { getAuthTokenPageUrl } from '@/common/utils/environment'
import { authTokenUtil } from '../../../../main/config'

// 录入只写文件, 校验和登录由协议的 AuthTokenWatcher 处理
export function createAuthTokenRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/auth-token/status', async (c) => {
    const { selfInfo, authTokenStatus } = ctx.qqProtocol
    return c.json({
      success: true,
      data: {
        applicable: true,
        online: selfInfo.online,
        hasToken: authTokenStatus.hasToken,
        validation: authTokenStatus.validation,
        message: authTokenStatus.message,
        loginError: authTokenStatus.loginError,
        authTokenPageUrl: getAuthTokenPageUrl(),
      },
    })
  })

  router.post('/auth-token', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) {
      return c.json({ success: false, message: 'Auth Token 不能为空' }, 400)
    }
    authTokenUtil.setToken(token)
    ctx.qqProtocol.checkAuthToken()
    return c.json({ success: true, message: 'Auth Token 已保存，正在校验' })
  })

  return router
}
