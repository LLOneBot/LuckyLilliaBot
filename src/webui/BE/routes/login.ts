import { Context } from 'cordis'
import { selfInfo, DATA_DIR } from '@/common/globalVars'
import { Hono } from 'hono'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'

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

  // 获取账号信息 + 该账号最终生效的 WebUI 配置.
  // 登录成功后会加载 config_<uin>.json, 里面可能关闭 WebUI (enable=false) 或改了端口 -- 那样后端
  // 会自行 restart/关停, FE 若直接跳主页就会一路 502. 这里直接读 config_<uin>.json (磁盘上的最终值,
  // 且从一开始就在) 而非 webuiServer 运行态, 避开 "online 先于 config 加载" 的竞态: FE 在第一次
  // 拿到 online=true (此时后端还没关) 就能读到最终 webui 配置, 据此决定跳主页 / 提示已关闭 / 跳新端口.
  router.get('/login-info', (c) => {
    let webui: { enable: boolean; host: string; port: number } | undefined
    if (selfInfo.online && selfInfo.uin) {
      try {
        const p = path.join(DATA_DIR, `config_${selfInfo.uin}.json`)
        if (existsSync(p)) {
          const cfg = JSON5.parse(readFileSync(p, 'utf-8'))
          if (cfg?.webui) {
            webui = {
              enable: cfg.webui.enable !== false,
              host: cfg.webui.host ?? '',
              port: Number(cfg.webui.port) || 0,
            }
          }
        }
      } catch {
        // 读不出就不带 webui, FE 回退到默认跳主页逻辑
      }
    }
    return c.json({ success: true, data: { ...selfInfo, webui } })
  })

  return router
}
