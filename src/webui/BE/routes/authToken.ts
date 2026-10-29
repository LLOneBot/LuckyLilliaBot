import { Hono } from 'hono'
import { isPmhqMode, getAuthTokenPageUrl } from '@/common/utils/environment'
import { authTokenUtil } from '../../../main/config'
import { authTokenStatus, selfInfo } from '@/common/globalVars'
import { triggerAuthTokenCheck } from '../../../plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/authTokenWatcher'

// 录入只写文件, 校验和登录由 authTokenWatcher 处理
export function createAuthTokenRoutes(): Hono {
  const router = new Hono()

  router.get('/auth-token/status', async (c) => {
    return c.json({
      success: true,
      data: {
        applicable: !isPmhqMode(),
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
    // 先置 validating, 免得前端轮询到上一次的结果
    authTokenStatus.hasToken = true
    authTokenStatus.validation = 'validating'
    authTokenStatus.message = ''
    authTokenStatus.loginError = ''
    triggerAuthTokenCheck()
    return c.json({ success: true, message: 'Auth Token 已保存，正在校验' })
  })

  return router
}
