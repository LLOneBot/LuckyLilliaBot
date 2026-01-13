import { Router, Request, Response } from 'express'
import { Context } from 'cordis'
import { networkInterfaces } from 'os'
import { getConfigUtil, webuiTokenUtil } from '@/common/config'
import { selfInfo } from '@/common/globalVars'
import { ReqConfig, ResConfig } from '../types'
import { Config } from '@/common/types'

function isListenAllInterfaces(host: string | undefined): boolean {
  return !host || host === '0.0.0.0' || host === '::'
}

function validateTokenConfig(config: Config): string | null {
  // 检查 Satori
  if (config.satori?.enable && isListenAllInterfaces(config.satori.host) && !config.satori.token) {
    return 'Satori 监听全部地址时必须设置 Token'
  }

  // 检查 Milky HTTP
  if (config.milky?.enable && isListenAllInterfaces(config.milky.http?.host) && !config.milky.http?.accessToken) {
    return 'Milky HTTP 监听全部地址时必须设置 Token'
  }

  // 检查 OneBot11 适配器
  if (config.ob11?.enable && Array.isArray(config.ob11.connect)) {
    for (const conn of config.ob11.connect) {
      if (!conn.enable) continue
      if ((conn.type === 'ws' || conn.type === 'http') && isListenAllInterfaces(conn.host) && !conn.token) {
        const typeName = conn.type === 'ws' ? 'WebSocket' : 'HTTP'
        return `OneBot11 ${typeName} 适配器监听全部地址时必须设置 Token`
      }
    }
  }

  return null
}

export function createConfigRoutes(ctx: Context): Router {
  const router = Router()

  // 获取网卡列表
  router.get('/network-interfaces', (req, res) => {
    try {
      const interfaces = networkInterfaces()
      const addresses: string[] = []
      for (const name in interfaces) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            addresses.push(iface.address)
          }
        }
      }
      res.json({ success: true, data: addresses })
    } catch (e) {
      res.status(500).json({ success: false, message: '获取网卡列表失败', error: e })
    }
  })

  // 设置token接口
  router.post('/set-token', (req: Request, res: Response) => {
    const { token } = req.body
    if (!token) {
      res.status(400).json({ success: false, message: 'Token不能为空' })
      return
    }
    webuiTokenUtil.setToken(token)
    res.json({ success: true, message: 'Token设置成功' })
  })

  // 获取配置
  router.get('/config/', (req, res) => {
    try {
      const config = getConfigUtil().getConfig()
      const resJson: ResConfig = {
        config,
        selfInfo,
      }
      res.json({
        success: true,
        data: resJson,
      })
    } catch (e) {
      res.status(500).json({ success: false, message: '获取配置失败', error: e })
    }
  })

  // 保存配置
  router.post('/config', (req, res) => {
    try {
      const { config } = req.body as ReqConfig
      const oldConfig = getConfigUtil().getConfig()
      const newConfig = { ...oldConfig, ...config }
      
      const validationError = validateTokenConfig(newConfig)
      if (validationError) {
        res.status(400).json({ success: false, message: validationError })
        return
      }
      
      getConfigUtil().setConfig(newConfig)
      ctx.parallel('llob/config-updated', newConfig)
      res.json({ success: true, message: '配置保存成功' })
    } catch (e) {
      res.status(500).json({ success: false, message: '保存配置失败', error: e })
    }
  })

  return router
}
