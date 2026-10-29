import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createDashboardRoutes } from '@/plugin/internal/tool/dashboard/routes'

describe('dashboard routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  it('answers with the bot process and the machine alone, whatever plugins run', async () => {
    const res = await createTestApp(createDashboardRoutes(ctx)).request('/dashboard/stats')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.bot).toBeDefined()
    expect(data.system).toBeDefined()
    expect(data.startupTime).toBeGreaterThan(0)
    expect(data.version).toBeTruthy()
    for (const key of ['friendCount', 'groupCount', 'messageReceived', 'messageSent', 'qq', 'mode']) {
      expect(data[key], key).toBeUndefined()
    }
  })
})
