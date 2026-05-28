import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 系统接口', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('get_login_info 返回当前账号', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ uin: number }>('get_login_info')
    Assertions.assertSuccess(res, 'get_login_info')
    expect(res.data?.uin).toBe(ctx.primaryUserId)
  })

  it('get_impl_info 返回实现信息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('get_impl_info')
    Assertions.assertSuccess(res, 'get_impl_info')
    expect(res.data).toBeDefined()
  })
})
