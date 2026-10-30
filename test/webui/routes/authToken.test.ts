import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authTokenUtil } from '@/main/config'
import { createAuthTokenRoutes } from '@/plugin/internal/protocol/nt-protocol/authTokenRoutes'
import { createMockContext } from '../helpers/mockContext'
import { createTestApp } from '../helpers/testApp'

vi.mock('@/main/config', () => ({
  authTokenUtil: { setToken: vi.fn() },
}))

function submit(app: ReturnType<typeof createTestApp>, token: string) {
  return app.request('/auth-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

describe('auth token routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  it('report the token status of the protocol that runs', async () => {
    Object.assign(ctx.qqProtocol.authTokenStatus, { validation: 'invalid', message: 'Auth Token 无效' })
    const body = await (await createTestApp(createAuthTokenRoutes(ctx)).request('/auth-token/status')).json()
    expect(body.data).toMatchObject({
      applicable: true,
      online: true,
      hasToken: true,
      validation: 'invalid',
      message: 'Auth Token 无效',
      loginError: '',
    })
  })

  it('save a submitted token and leave checking it to the protocol', async () => {
    const res = await submit(createTestApp(createAuthTokenRoutes(ctx)), ' new-token ')
    expect(res.status).toBe(200)
    expect(authTokenUtil.setToken).toHaveBeenCalledExactlyOnceWith('new-token')
    expect(ctx.qqProtocol.checkAuthToken).toHaveBeenCalledTimes(1)
  })

  it('turn an empty token away', async () => {
    const res = await submit(createTestApp(createAuthTokenRoutes(ctx)), '  ')
    expect(res.status).toBe(400)
    expect(authTokenUtil.setToken).not.toHaveBeenCalled()
    expect(ctx.qqProtocol.checkAuthToken).not.toHaveBeenCalled()
  })
})
