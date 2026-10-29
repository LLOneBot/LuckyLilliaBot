import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createDashboardRoutes } from '@/plugin/internal/service/webui/BE/routes/dashboard'
import { getProtocol, isPmhqMode } from '@/common/utils/environment'

describe('dashboard routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('GET /dashboard/stats', () => {
    it('answers with the process and system alone while the NT protocol is off or not logged in', async () => {
      ctx.get.mockImplementation(() => undefined)
      const res = await createTestApp(createDashboardRoutes(ctx)).request('/dashboard/stats')
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.bot).toBeDefined()
      expect(data.system).toBeDefined()
      expect(data.startupTime).toBeGreaterThan(0)
      for (const key of ['friendCount', 'groupCount', 'messageReceived', 'messageSent', 'qq', 'mode']) {
        expect(data[key], key).toBeUndefined()
      }
    })

    it('returns stats on success', async () => {
      ctx.get.mockImplementation((key: string) => {
        if (key === 'app') return {
          messageReceivedCount: 100,
          messageSentCount: 50,
          startupTime: Date.now(),
          lastMessageTime: Date.now(),
        }
        if (key === 'qqProtocol') return ctx.qqProtocol
        if (key === 'ntFriendApi') return ctx.ntFriendApi
        if (key === 'ntGroupApi') return ctx.ntGroupApi
        return undefined
      })
      ctx.ntFriendApi.getFriends.mockResolvedValue({
        friends: [{}, {}, {}],
        categories: new Map()
      })
      ctx.ntGroupApi.getGroups.mockResolvedValue([{}, {}])

      const app = createTestApp(createDashboardRoutes(ctx))
      const res = await app.request('/dashboard/stats')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.friendCount).toBe(3)
      expect(body.data.groupCount).toBe(2)
      expect(body.data.messageReceived).toBe(100)
      expect(body.data.messageSent).toBe(50)
      expect(body.data.bot).toBeDefined()
      expect(body.data.qq.memory).toBe(500000000)
      expect(body.data.qq.cpu).toBe(1.5)
    })

    it('omits qq when the protocol cannot read the QQ process', async () => {
      mockAppReady()
      ctx.qqProtocol.getQQResourceUsage.mockResolvedValue(null)
      const data = await stats()
      expect(data.qq).toBeUndefined()
      expect(data.system).toBeDefined()
    })

    function mockAppReady() {
      ctx.get.mockImplementation((key: string) => {
        if (key === 'app') return { messageReceivedCount: 0, messageSentCount: 0, startupTime: 0, lastMessageTime: 0 }
        if (key === 'qqProtocol') return ctx.qqProtocol
        if (key === 'ntFriendApi') return ctx.ntFriendApi
        if (key === 'ntGroupApi') return ctx.ntGroupApi
        return undefined
      })
    }

    async function stats() {
      const res = await createTestApp(createDashboardRoutes(ctx)).request('/dashboard/stats')
      return (await res.json()).data
    }

    // environment 整个模块被 test/unit/setup.ts mock 掉了, 改 process.argv 不生效
    it('reports the active protocol in direct mode', async () => {
      mockAppReady()
      vi.mocked(getProtocol).mockReturnValue('macos')
      const data = await stats()
      expect(data.mode).toBe('direct')
      expect(data.protocol).toBe('macos')
    })

    it('omits the protocol in PMHQ mode', async () => {
      mockAppReady()
      vi.mocked(isPmhqMode).mockReturnValue(true)
      const data = await stats()
      expect(data.mode).toBe('pmhq')
      expect(data.protocol).toBeUndefined()
    })
  })

  describe('GET /device-info', () => {
    it('returns device info', async () => {
      ctx.ntSystemApi.getDeviceInfo.mockResolvedValue({ os: 'Linux', kernel: '5.4' })
      const app = createTestApp(createDashboardRoutes(ctx))

      const res = await app.request('/device-info')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.os).toBe('Linux')
    })

    it('answers 503 while the NT protocol is off', async () => {
      ctx.get.mockImplementation(() => undefined)
      const res = await createTestApp(createDashboardRoutes(ctx)).request('/device-info')
      expect(res.status).toBe(503)
    })

    it('returns 500 on error', async () => {
      ctx.ntSystemApi.getDeviceInfo.mockRejectedValue(new Error('fail'))
      const app = createTestApp(createDashboardRoutes(ctx))

      const res = await app.request('/device-info')
      expect(res.status).toBe(500)
    })
  })
})
