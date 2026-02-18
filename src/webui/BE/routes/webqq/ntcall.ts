import { Router } from 'express'
import { Context } from 'cordis'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { serializeResult } from '../../../BE/utils'

export function createNtCallRoutes(ctx: Context): Router {
  const router = Router()

  // 通用 NT API 调用接口
  router.post('/ntcall/:service/:method', async (req, res) => {
    try {
      const { service, method } = req.params
      const args = req.body?.args || []

      if (!service || !method) {
        res.status(400).json({ success: false, message: '缺少 service 或 method 参数' })
        return
      }

      // 白名单：只允许调用 inject 中声明的服务 + pmhq
      const allowedServices = ['ntUserApi', 'ntGroupApi', 'ntFriendApi', 'ntFileApi', 'ntMsgApi', 'pmhq']
      if (!allowedServices.includes(service)) {
        res.status(400).json({ success: false, message: `不支持的服务: ${service}` })
        return
      }

      // pmhq 是单例，不在 ctx 中
      const serviceInstance = service === 'pmhq' ? pmhq : (ctx as any)[service]
      if (!serviceInstance) {
        res.status(400).json({ success: false, message: `服务 ${service} 未注入` })
        return
      }

      const methodFunc = serviceInstance[method]
      if (typeof methodFunc !== 'function') {
        res.status(400).json({ success: false, message: `服务 ${service} 没有方法: ${method}` })
        return
      }

      const result = await methodFunc.apply(serviceInstance, args || [])
      const serializedResult = serializeResult(result)

      res.json({ success: true, data: serializedResult })
    } catch (e: any) {
      ctx.logger.error('NT API 调用失败:', e)
      res.status(500).json({ success: false, message: 'NT API 调用失败', error: e.message })
    }
  })

  return router
}
