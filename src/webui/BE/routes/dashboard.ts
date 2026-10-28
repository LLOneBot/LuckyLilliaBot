import { Context } from 'cordis'
import { Hono } from 'hono'
import os from 'node:os'
import { getProtocol, isPmhqMode } from '@/common/utils/environment'

// os.cpus() 是开机以来的累计时间, 要两次采样算增量; os.loadavg() 在 Windows 上恒为 0
function readCpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const c of os.cpus()) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
  }
  return { idle, total }
}

async function sampleSystemCpuPercent(sampleMs = 150): Promise<number> {
  const a = readCpuTimes()
  await new Promise((r) => setTimeout(r, sampleMs))
  const b = readCpuTimes()
  const totalDelta = b.total - a.total
  const idleDelta = b.idle - a.idle
  if (totalDelta <= 0) return 0
  return Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100))
}

export function createDashboardRoutes(ctx: Context): Hono {
  const router = new Hono()

  // The process and system parts always; the account's once the NT protocol runs and is logged in
  router.get('/dashboard/stats', async (c) => {
    try {
      const app = ctx.get('app')
      const protocol = ctx.get('qqProtocol')
      let account: { friendCount: number; groupCount: number; messageReceived: number; messageSent: number; lastMessageTime: number } | undefined
      if (app) {
        const friends = await ctx.get('ntFriendApi')!.getFriends(false)
        const groups = await ctx.get('ntGroupApi')!.getGroups(false)
        account = {
          friendCount: friends.friends.length,
          groupCount: groups.length,
          messageReceived: app.messageReceivedCount,
          messageSent: app.messageSentCount,
          lastMessageTime: app.lastMessageTime,
        }
      }

      const qq = await protocol?.getQQResourceUsage()

      const botTotalMem = os.totalmem()
      const cpuCores = os.cpus().length
      const memUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      const botCpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() / cpuCores) * 100
      const botMemoryPercent = (memUsage.rss / botTotalMem) * 100

      const sysTotalMem = os.totalmem()
      const sysUsedMem = sysTotalMem - os.freemem()
      const sysMemPercent = (sysUsedMem / sysTotalMem) * 100
      const sysCpuPercent = await sampleSystemCpuPercent()

      const mode = protocol ? (isPmhqMode() ? 'pmhq' : 'direct') : undefined

      return c.json({
        success: true,
        data: {
          ...account,
          startupTime: app?.startupTime ?? Math.trunc(Date.now() / 1000 - process.uptime()),
          mode,
          // --protocol 只对直连有意义
          protocol: mode === 'direct' ? getProtocol() : undefined,
          bot: {
            memory: memUsage.rss,
            totalMemory: botTotalMem,
            memoryPercent: botMemoryPercent,
            cpu: botCpuPercent,
          },
          qq: qq ?? undefined,
          system: {
            memory: sysUsedMem,
            totalMemory: sysTotalMem,
            memoryPercent: sysMemPercent,
            cpu: sysCpuPercent,
            label: `${cpuCores} 核`,
          },
        },
      })
    } catch (e) {
      return c.json({ success: false, message: '获取统计数据失败', error: e }, 500)
    }
  })

  router.get('/device-info', async (c) => {
    const systemApi = ctx.get('ntSystemApi')
    if (!systemApi) return c.json({ success: false, message: 'NTQQ 协议未启用' }, 503)
    try {
      const deviceInfo = await systemApi.getDeviceInfo()
      return c.json({
        success: true,
        data: deviceInfo,
      })
    } catch (e) {
      return c.json({ success: false, message: '获取设备信息失败', error: e }, 500)
    }
  })

  return router
}

/** Up with the WebUI shell, NT protocol or not: the NT services are looked up per request. */
export const DashboardRoutes = {
  name: 'webui-dashboard-routes',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    const app = new Hono().route('/api', createDashboardRoutes(ctx))
    ctx.webuiServer.route('/api/dashboard', app)
    ctx.webuiServer.route('/api/device-info', app)
  },
}
