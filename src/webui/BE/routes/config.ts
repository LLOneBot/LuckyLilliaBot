import { Dict } from 'cosmokit'
import { Context } from 'cordis'
import { networkInterfaces } from 'os'
import { selfInfo } from '@/common/globalVars'
import { ReqConfig, ResConfig } from '../types'
import { currentInstance } from '@/common/instance'
import { isDockerEnvironment } from '@/common/utils/environment'
import { Hono } from 'hono'
import { webuiTokenUtil } from '../../../main/config'
import { applyLegacyConfig } from '../../../main/config/legacyConfig'
import { PluginConfigError } from '../../../plugin'

export function createConfigRoutes(ctx: Context): Hono {
  const router = new Hono()

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

  router.post('/set-token', async (c) => {
    const { token } = await c.req.json()
    if (!token) {
      return c.json({ success: false, message: 'Token不能为空' }, 400)
    }
    webuiTokenUtil.setToken(token)
    return c.json({ success: true, message: 'Token设置成功' })
  })

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

  router.post('/config', async (c) => {
    try {
      const { config } = await c.req.json() as ReqConfig
      // Adapter sections (old clients send them) go to the adapters' plugin entries, validated there
      await applyLegacyConfig(ctx, config as Dict)
      return c.json({ success: true, message: '配置保存成功' })
    } catch (e) {
      if (e instanceof PluginConfigError) return c.json({ success: false, message: e.message }, 400)
      return c.json({ success: false, message: '保存配置失败', error: e }, 500)
    }
  })

  return router
}
