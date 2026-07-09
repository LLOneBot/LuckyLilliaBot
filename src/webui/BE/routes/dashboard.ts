import { Context } from 'cordis'
import { Hono } from 'hono'
import os from 'node:os'
import { isPmhqMode } from '@/common/utils/environment'

// 整机 CPU 使用率: os.cpus() 给的是自开机累计时间, 需两次采样求增量占比 (瞬时值).
// os.loadavg() 在 Windows 恒为 [0,0,0] 不可用, 故手动算.
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

  // 获取 Dashboard 统计数据
  router.get('/dashboard/stats', async (c) => {
    try {
      const app = ctx.get('app')
      if (!app) {
        return c.json({ success: false, message: '服务尚未就绪，请等待登录完成' }, 503)
      }
      const friends = await ctx.ntFriendApi.getFriends(false)
      const groups = await ctx.ntGroupApi.getGroups(false)

      // 直连 / PMHQ 模式都没有独立 QQ 进程的 RPC，QQ 资源占用拿不到
      const qqMemory = 0
      const qqCpu = 0
      const qqMemoryPercent = 0

      // Bot 进程资源
      const botTotalMem = os.totalmem()
      const cpuCores = os.cpus().length
      const memUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      const botCpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() / cpuCores) * 100
      const botMemoryPercent = (memUsage.rss / botTotalMem) * 100

      // 系统 (整机) 资源: Direct 模式无独立 QQ 进程, 前端把 "QQ 资源" 卡换成 "系统资源" 展示这个
      const sysTotalMem = os.totalmem()
      const sysUsedMem = sysTotalMem - os.freemem()
      const sysMemPercent = (sysUsedMem / sysTotalMem) * 100
      const sysCpuPercent = await sampleSystemCpuPercent()

      return c.json({
        success: true,
        data: {
          friendCount: friends.friends.length,
          groupCount: groups.length,
          messageReceived: app.messageReceivedCount,
          messageSent: app.messageSentCount,
          startupTime: app.startupTime,
          lastMessageTime: app.lastMessageTime,
          // Direct 模式无 QQ 进程 -> 前端据此把首张卡显示为 "系统资源"; PMHQ 保留 "QQ 资源"
          mode: isPmhqMode() ? 'pmhq' : 'direct',
          bot: {
            memory: memUsage.rss,
            totalMemory: botTotalMem,
            memoryPercent: botMemoryPercent,
            cpu: botCpuPercent,
          },
          qq: {
            memory: qqMemory,
            totalMemory: 0,
            memoryPercent: qqMemoryPercent,
            cpu: qqCpu,
          },
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

  // 获取设备信息
  router.get('/device-info', async (c) => {
    try {
      const deviceInfo = await ctx.ntSystemApi.getDeviceInfo()
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
