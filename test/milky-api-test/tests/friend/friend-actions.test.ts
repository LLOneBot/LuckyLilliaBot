import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 好友写操作', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('send_friend_nudge: primary 戳 secondary，调用成功', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('send_friend_nudge', {
      user_id: ctx.secondaryUserId,
      is_self: false,
    })
    Assertions.assertSuccess(res, 'send_friend_nudge')
  }, 15000)

  it('send_profile_like: primary 给 secondary 点 1 个赞', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('send_profile_like', {
      user_id: ctx.secondaryUserId,
      count: 1,
    })
    Assertions.assertSuccess(res, 'send_profile_like')
  }, 15000)

  it('get_friend_requests 拉好友请求列表（结构合法即可）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ requests: any[] }>('get_friend_requests', { limit: 10 })
    Assertions.assertSuccess(res, 'get_friend_requests')
    expect(Array.isArray(res.data?.requests)).toBe(true)
  }, 15000)

  // 破坏性，跳过：
  // - delete_friend                — 会拆好友关系，破坏其它用例
  // - accept_friend_request        — 需要先有人加好友，依赖第三方
  // - reject_friend_request        — 同上
})
