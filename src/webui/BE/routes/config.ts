import { Dict } from 'cosmokit'
import { Context } from 'cordis'
import { networkInterfaces } from 'os'
import { selfInfo } from '@/common/globalVars'
import { ReqConfig, ResConfig } from '../types'
import { currentInstance } from '@/common/instance'
import { isDockerEnvironment } from '@/common/utils/environment'
import { Hono } from 'hono'
import { webuiTokenUtil } from '../../../main/config'
import { validateConfig } from '../../../main/config/validate'

export function createConfigRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 获取网卡列表
  router.get('/network-interfaces', async (c) => {
    try {
      const isDocker = isDockerEnvironment()
      const interfaces = networkInterfaces()
      const addresses: string[] = []
      if (!isDocker) {
        for (const name in interfaces) {
          for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
              addresses.push(iface.address)
            }
          }
        }
      }
      return c.json({ success: true, data: addresses, isDocker })
    } catch (e) {
      return c.json({ success: false, message: '获取网卡列表失败', error: e }, 500)
    }
  })

  // 设置token接口
  router.post('/set-token', async (c) => {
    const { token } = await c.req.json()
    if (!token) {
      return c.json({ success: false, message: 'Token不能为空' }, 400)
    }
    webuiTokenUtil.setToken(token)
    return c.json({ success: true, message: 'Token设置成功' })
  })

  // 获取配置
  router.get('/config', async (c) => {
    try {
      const resJson: ResConfig = {
        config: ctx.config.get(),
        selfInfo,
        envLocked: ctx.config.envLocks(),
        instance: currentInstance().name,
      }
      return c.json({
        success: true,
        data: resJson,
      })
    } catch (e) {
      return c.json({ success: false, message: '获取配置失败', error: e }, 500)
    }
  })

  // 保存配置
  router.post('/config', async (c) => {
    try {
      const { config } = await c.req.json() as ReqConfig
      // 校验的就是 patch() 会落下的那份 (同一个深合并、同样剔掉 env 锁定字段)。浅合并会误拒
      // { satori: { enable: true } } 这类局部提交, 也会放过把已启用的监听改成无 token 的提交。
      // 只查这次提交涉及的片段, 磁盘上别的片段已有的问题不拦这次保存
      const validationError = validateConfig(ctx.config.preview(config as Dict), Object.keys(config))
      if (validationError) {
        return c.json({ success: false, message: validationError }, 400)
      }

      ctx.parallel('llob/config-updated', ctx.config.patch(config as Dict))
      return c.json({ success: true, message: '配置保存成功' })
    } catch (e) {
      return c.json({ success: false, message: '保存配置失败', error: e }, 500)
    }
  })

  return router
}
