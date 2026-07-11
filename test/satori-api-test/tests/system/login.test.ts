import { setupSatoriTest, teardownSatoriTest, SatoriTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Satori 登录 / smoke', () => {
  let ctx: SatoriTestContext

  beforeAll(async () => {
    ctx = await setupSatoriTest()
  })

  afterAll(() => {
    teardownSatoriTest(ctx)
  })

  it('login.get 返回当前账号', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ user: { id: string; name: string }; status: number }>('login.get', {})
    Assertions.assertSuccess(res, 'login.get')
    Assertions.assertDefined(res.data, 'login.get.data')
    Assertions.assertDefined(res.data?.user, 'login.user')
    expect(res.data?.user?.id).toBe(ctx.primaryUserId)
    // status: 1 = ONLINE, 0 = OFFLINE 等（Universal.Status）
    expect(typeof res.data?.status).toBe('number')
  }, 15000)

  it('guild.list 包含测试群', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ data: Array<{ id: string }> }>('guild.list', {})
    Assertions.assertSuccess(res, 'guild.list')
    const found = res.data?.data?.find(g => g.id === ctx.testGroupId)
    expect(found).toBeDefined()
  }, 15000)

  it('user.get 返回 secondary 资料', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ id: string; name: string }>('user.get', { user_id: ctx.secondaryUserId })
    Assertions.assertSuccess(res, 'user.get')
    expect(res.data?.id).toBe(ctx.secondaryUserId)
    expect(typeof res.data?.name).toBe('string')
  }, 15000)
})
