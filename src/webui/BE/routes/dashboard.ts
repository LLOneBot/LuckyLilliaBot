import { Router } from 'express'
import { Context } from 'cordis'
import { pmhq } from '@/ntqqapi/native/pmhq'

export function createDashboardRoutes(ctx: Context): Router {
  const router = Router()

  // 获取 Dashboard 统计数据
  router.get('/dashboard/stats', async (req, res) => {
    try {
      const app = ctx.get('app')
      if (!app) {
        res.status(503).json({ success: false, message: '服务尚未就绪，请等待登录完成' })
        return
      }
      const friends = await ctx.ntFriendApi.getBuddyList()
      const groups = await ctx.ntGroupApi.getGroups(false)

      // 获取 QQ 进程资源
      const qqInfo = await pmhq.getProcessInfo()
      const qqMemory = qqInfo?.memory?.rss || 0
      const qqCpu = qqInfo?.cpu?.percent || 0
      const qqTotalMem = qqInfo?.memory?.totalMem || 1
      const qqMemoryPercent = (qqMemory / qqTotalMem) * 100

      // Bot 进程资源
      const os = await import('os')
      const botTotalMem = os.totalmem()
      const cpuCores = os.cpus().length
      const memUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      const botCpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() / cpuCores) * 100
      const botMemoryPercent = (memUsage.rss / botTotalMem) * 100

      res.json({
        success: true,
        data: {
          friendCount: friends.length,
          groupCount: groups.length,
          messageReceived: app.messageReceivedCount,
          messageSent: app.messageSentCount,
          startupTime: app.startupTime,
          lastMessageTime: app.lastMessageTime,
          bot: {
            memory: memUsage.rss,
            totalMemory: botTotalMem,
            memoryPercent: botMemoryPercent,
            cpu: botCpuPercent,
          },
          qq: {
            memory: qqMemory,
            totalMemory: qqTotalMem,
            memoryPercent: qqMemoryPercent,
            cpu: qqCpu,
          },
        },
      })
    } catch (e) {
      res.status(500).json({ success: false, message: '获取统计数据失败', error: e })
    }
  })

  // 获取设备信息
  router.get('/device-info', async (req, res) => {
    try {
      const deviceInfo = await ctx.ntSystemApi.getDeviceInfo()
      res.json({
        success: true,
        data: deviceInfo,
      })
    } catch (e) {
      res.status(500).json({ success: false, message: '获取设备信息失败', error: e })
    }
  })

  return router
}
