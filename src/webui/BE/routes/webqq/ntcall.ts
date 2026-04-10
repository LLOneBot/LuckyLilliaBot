import { Context } from 'cordis'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { serializeResult } from '../../../BE/utils'
import { Hono } from 'hono'

export function createNtCallRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 通用 NT API 调用接口
  router.post('/ntcall/:service/:method', async (c) => {
    try {
      const { service, method } = c.req.param()
      const args = (await c.req.json()).args || []

      if (!service || !method) {
        return c.json({ success: false, message: '缺少 service 或 method 参数' }, 400)
      }

      // 白名单：只允许调用 inject 中声明的服务 + pmhq
      const allowedServices = ['ntUserApi', 'ntGroupApi', 'ntFriendApi', 'ntFileApi', 'ntMsgApi', 'pmhq']
      if (!allowedServices.includes(service)) {
        return c.json({ success: false, message: `不支持的服务: ${service}` }, 400)
      }

      // pmhq 是单例，不在 ctx 中
      const serviceInstance = service === 'pmhq' ? pmhq : ctx.get(service)
      if (!serviceInstance) {
        return c.json({ success: false, message: `服务 ${service} 未注入` }, 400)
      }

      const methodFunc = serviceInstance[method]
      if (typeof methodFunc !== 'function') {
        return c.json({ success: false, message: `服务 ${service} 没有方法: ${method}` }, 400)
      }

      const result = await methodFunc.apply(serviceInstance, args || [])
      const serializedResult = serializeResult(result)

      return c.json({ success: true, data: serializedResult })
    } catch (e) {
      ctx.logger.error('NT API 调用失败:', e)
      return c.json({ success: false, message: 'NT API 调用失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
