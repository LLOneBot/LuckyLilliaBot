import { setupSatoriTest, teardownSatoriTest, SatoriTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Satori 好友 / 用户', () => {
  let ctx: SatoriTestContext

  beforeAll(async () => {
    ctx = await setupSatoriTest()
  })

  afterAll(() => {
    teardownSatoriTest(ctx)
  })

  it('friend.list 至少包含 secondary', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ data: Array<{ user: { id: string } }> }>('friend.list', {})
    Assertions.assertSuccess(res, 'friend.list')
    const ids = (res.data?.data ?? []).map(f => f.user?.id)
    expect(ids).toContain(ctx.secondaryUserId)
  }, 15000)

  it('user.get 返回 secondary 资料 (重复一遍 smoke 的，确认稳定)', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ id: string; name: string; avatar?: string; is_bot: boolean }>('user.get', {
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'user.get')
    expect(res.data?.id).toBe(ctx.secondaryUserId)
    expect(typeof res.data?.name).toBe('string')
    expect(typeof res.data?.is_bot).toBe('boolean')
  }, 15000)
})
