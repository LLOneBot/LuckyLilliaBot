import { Context } from 'cordis'
import { Hono } from 'hono'
import os from 'node:os'
import { version } from '../../../../version'

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

  // The bot process and the machine; what plugins count goes on their own Dashboard cards
  router.get('/dashboard/stats', async (c) => {
    try {
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

      return c.json({
        success: true,
        data: {
          version,
          startupTime: Math.trunc(Date.now() / 1000 - process.uptime()),
          bot: {
            memory: memUsage.rss,
            totalMemory: botTotalMem,
            memoryPercent: botMemoryPercent,
            cpu: botCpuPercent,
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

  return router
}
