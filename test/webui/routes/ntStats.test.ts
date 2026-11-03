import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createNTStatsRoutes } from '@/plugin/internal/protocol/nt-protocol/statsRoutes'
import { getProtocol, isNativeQQMode } from '@/common/utils/environment'

// The NT protocol plugin's Dashboard figures
describe('GET /ntqq/stats', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  function services(app?: Record<string, unknown>) {
    ctx.get.mockImplementation((key: string) => {
      if (key === 'app') return app
      if (key === 'qqProtocol') return ctx.qqProtocol
      if (key === 'ntFriendApi') return ctx.ntFriendApi
      if (key === 'ntGroupApi') return ctx.ntGroupApi
      if (key === 'ntSystemApi') return ctx.ntSystemApi
      return undefined
    })
  }

  async function stats() {
    const res = await createTestApp(createNTStatsRoutes(ctx)).request('/ntqq/stats')
    expect(res.status).toBe(200)
    return (await res.json()).data
  }

  it('counts the account once logged in', async () => {
    services({ messageReceivedCount: 100, messageSentCount: 50, startupTime: 0, lastMessageTime: 0 })
    ctx.ntFriendApi.getFriends.mockResolvedValue({ friends: [{}, {}, {}], categories: new Map() })
    ctx.ntGroupApi.getGroups.mockResolvedValue([{}, {}])
    const data = await stats()
    expect(data).toMatchObject({ friendCount: 3, groupCount: 2, messageReceived: 100, messageSent: 50 })
    expect(data.qq.memory).toBe(500000000)
    expect(data.version).toBe('9.9.19-34566')
  })

  it('has the mode alone before the login, and no QQ process where it cannot be read', async () => {
    services(undefined)
    ctx.qqProtocol.getQQResourceUsage.mockResolvedValue(null)
    ctx.ntSystemApi.getDeviceInfo.mockResolvedValue({ devType: 'Linux', buildVer: '3.2.28-48517' })
    const data = await stats()
    expect(data.friendCount).toBeUndefined()
    expect(data.qq).toBeUndefined()
    expect(data.mode).toBe('direct')
    expect(data.version).toBe('3.2.28-48517')
  })

  // environment 整个模块被 test/unit/setup.ts mock 掉了, 改 process.argv 不生效
  it('names the protocol of the pure protocol only', async () => {
    services(undefined)
    vi.mocked(getProtocol).mockReturnValue('macos')
    expect((await stats()).protocol).toBe('macos')
    vi.mocked(isNativeQQMode).mockReturnValue(true)
    const data = await stats()
    expect(data.mode).toBe('nativeqq')
    expect(data.protocol).toBeUndefined()
  })
})
