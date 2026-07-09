import { Hono } from 'hono'
import { isPmhqMode } from '@/common/utils/environment'
import { authTokenUtil } from '../../../main/config'
import { authTokenStatus, selfInfo } from '@/common/globalVars'
import { triggerAuthTokenCheck } from '../../../main/qqProtocol/direct/authTokenWatcher'

// QQ sign auth token 的查询/录入, 在 authMiddleware(WebUI 密码)之后.
// 录入接口只写文件, 不做校验; 校验与登录由后端 authTokenWatcher 监听文件变化触发.
export function createAuthTokenRoutes(): Hono {
  const router = new Hono()

  // 查询状态: 直接读内存 authTokenStatus (watcher 维护), 不发网络请求, 不阻塞前端
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
      },
    })
  })

  // 录入 auth token: 只写文件并触发校验流程, 不在此校验. watcher 会读取->校验->(通过则)登录.
  router.post('/auth-token', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) {
      return c.json({ success: false, message: 'Auth Token 不能为空' }, 400)
    }
    authTokenUtil.setToken(token)
    // 立即置 validating, 避免前端轮询到上一次的 valid/invalid 旧态; 真正校验在 watcher 里
    authTokenStatus.hasToken = true
    authTokenStatus.validation = 'validating'
    authTokenStatus.message = ''
    authTokenStatus.loginError = ''
    triggerAuthTokenCheck()
    return c.json({ success: true, message: 'Auth Token 已保存，正在校验' })
  })

  return router
}
