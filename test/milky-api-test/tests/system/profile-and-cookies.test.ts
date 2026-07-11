import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 用户资料 / 列表 / 自身设置', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('get_user_profile 返回 secondary 的资料', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ nickname: string }>('get_user_profile', {
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'get_user_profile')
    Assertions.assertDefined(res.data, 'get_user_profile.data')
    Assertions.assertHasFields(res.data, ['nickname'], 'get_user_profile.data')
  }, 15000)

  it('get_friend_list 至少包含 secondary', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ friends: Array<{ user_id: number }> }>('get_friend_list', {})
    Assertions.assertSuccess(res, 'get_friend_list')
    const found = res.data?.friends?.find((f) => f.user_id === ctx.secondaryUserId)
    expect(found).toBeDefined()
  })

  it('get_group_member_list 包含 primary 和 secondary', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ members: Array<{ user_id: number }> }>('get_group_member_list', {
      group_id: ctx.testGroupId,
    })
    Assertions.assertSuccess(res, 'get_group_member_list')
    const ids = res.data?.members?.map((m) => m.user_id) ?? []
    expect(ids).toContain(ctx.primaryUserId)
    expect(ids).toContain(ctx.secondaryUserId)
  }, 15000)

  it('get_peer_pins 返回 { friends, groups } 结构', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ friends: any[]; groups: any[] }>('get_peer_pins', {})
    Assertions.assertSuccess(res, 'get_peer_pins')
    expect(Array.isArray(res.data?.friends)).toBe(true)
    expect(Array.isArray(res.data?.groups)).toBe(true)
  })

  it('set_peer_pin: 给 secondary 私聊置顶后再取消（成功即可）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const pin = await primary.call('set_peer_pin', {
      message_scene: 'friend',
      peer_id: ctx.secondaryUserId,
      is_pinned: true,
    })
    Assertions.assertSuccess(pin, 'set_peer_pin (pin)')
    await new Promise((r) => setTimeout(r, 500))
    const unpin = await primary.call('set_peer_pin', {
      message_scene: 'friend',
      peer_id: ctx.secondaryUserId,
      is_pinned: false,
    })
    Assertions.assertSuccess(unpin, 'set_peer_pin (unpin)')
  }, 15000)

  // set_nickname 即便是改成原名 (no-op) server 也常返 UpdateUdcFail (账号风控/限流), 不进全量回归
  it.skip('set_nickname 改成原名 (no-op) 应成功', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const info = await primary.call<{ nickname: string }>('get_login_info', {})
    Assertions.assertSuccess(info, 'get_login_info')
    const orig = info.data?.nickname ?? ''
    const res = await primary.call('set_nickname', { new_nickname: orig })
    Assertions.assertSuccess(res, 'set_nickname (orig)')
  }, 15000)

  it('set_bio 设置个性签名（再恢复）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const profile = await primary.call<{ bio?: string }>('get_user_profile', {
      user_id: ctx.primaryUserId,
    })
    const orig = profile.data?.bio ?? ''
    const newBio = `milky-test-bio-${Date.now()}`
    const res = await primary.call('set_bio', { new_bio: newBio })
    Assertions.assertSuccess(res, 'set_bio')
    await primary.call('set_bio', { new_bio: orig }).catch(() => undefined)
  }, 15000)

  it('get_cookies 拉到 qun.qq.com 的 cookies', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ cookies: string }>('get_cookies', { domain: 'qun.qq.com' })
    Assertions.assertSuccess(res, 'get_cookies')
    expect(typeof res.data?.cookies).toBe('string')
    expect((res.data?.cookies ?? '').length).toBeGreaterThan(0)
  }, 15000)

  it('get_csrf_token 返回 bkn (string)', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ csrf_token: string }>('get_csrf_token', {})
    Assertions.assertSuccess(res, 'get_csrf_token')
    expect(typeof res.data?.csrf_token).toBe('string')
    expect((res.data?.csrf_token ?? '').length).toBeGreaterThan(0)
  }, 15000)

  it('get_custom_face_url_list 返回数组', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ urls: string[] }>('get_custom_face_url_list', {})
    Assertions.assertSuccess(res, 'get_custom_face_url_list')
    expect(Array.isArray(res.data?.urls)).toBe(true)
  }, 15000)
})
