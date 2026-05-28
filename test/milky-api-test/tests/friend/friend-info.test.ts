import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 好友操作', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('get_friend_list 至少能拉到 secondary', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ friends: Array<{ user_id: number }> }>('get_friend_list', {})
    Assertions.assertSuccess(res, 'get_friend_list')
    const friend = res.data?.friends?.find((f) => f.user_id === ctx.secondaryUserId)
    expect(friend).toBeDefined()
  })

  it('get_friend_info 返回 secondary 的信息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ friend: { user_id: number } }>('get_friend_info', {
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'get_friend_info')
    expect(res.data?.friend?.user_id).toBe(ctx.secondaryUserId)
  })
})
