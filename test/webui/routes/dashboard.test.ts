import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createDashboardRoutes } from '@/webui/BE/routes/dashboard'

describe('dashboard routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('GET /dashboard/stats', () => {
    it('returns 503 when app is not ready', async () => {
      ctx.get.mockImplementation((key: string) => key === 'app' ? null : undefined)
      const app = createTestApp(createDashboardRoutes(ctx))

      const res = await app.request('/dashboard/stats')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.success).toBe(false)
    })

    it('returns stats on success', async () => {
      ctx.get.mockImplementation((key: string) => {
        if (key === 'app') return {
          messageReceivedCount: 100,
          messageSentCount: 50,
          startupTime: Date.now(),
          lastMessageTime: Date.now(),
        }
        if (key === 'pmhq') return ctx.pmhq
        return undefined
      })
      ctx.ntFriendApi.getBuddyList.mockResolvedValue([{}, {}, {}])
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
      expect(body.data.qq).toBeDefined()
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

    it('returns 500 on error', async () => {
      ctx.ntSystemApi.getDeviceInfo.mockRejectedValue(new Error('fail'))
      const app = createTestApp(createDashboardRoutes(ctx))

      const res = await app.request('/device-info')
      expect(res.status).toBe(500)
    })
  })
})
