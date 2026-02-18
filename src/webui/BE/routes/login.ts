import { Router } from 'express'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'

export function createLoginRoutes(ctx: Context): Router {
  const router = Router()

  // 获取登录二维码
  router.get('/login-qrcode', async (req, res) => {
    ctx.ntLoginApi.getLoginQrCode().then(data => {
      res.json({
        success: true,
        data,
      })
    }).catch(e => {
      res.status(500).json({ success: false, message: '获取登录二维码失败', error: e })
    })
  })

  // 获取快速登录账号列表
  router.get('/quick-login-list', async (req, res) => {
    ctx.ntLoginApi.getQuickLoginList().then(data => {
      res.json({
        success: true,
        data,
      })
    }).catch(e => {
      res.status(500).json({ success: false, message: '获取快速登录账号列表失败', error: e })
    })
  })

  // 快速登录
  router.post('/quick-login', async (req, res) => {
    const { uin } = req.body
    if (!uin) {
      res.status(400).json({ success: false, message: '没有选择QQ号' })
      return
    }
    ctx.ntLoginApi.quickLoginWithUin(uin).then((data) => {
      res.json({
        success: true,
        data,
        message: data.loginErrorInfo.errMsg,
      })
    }).catch(e => {
      res.status(500).json({ success: false, message: '快速登录失败', error: e })
    })
  })

  // 获取账号信息
  router.get('/login-info', (req, res) => {
    res.json({ success: true, data: selfInfo })
  })

  return router
}
