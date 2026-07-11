import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'
import { MediaPaths } from '../media'

describe('Milky 群成员操作', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('set_group_member_admin: 设/取消 secondary 管理员（成功即可）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const setRes = await primary.call('set_group_member_admin', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      is_set: true,
    })
    Assertions.assertSuccess(setRes, 'set_group_member_admin (set)')
    await new Promise((r) => setTimeout(r, 1500))
    const unsetRes = await primary.call('set_group_member_admin', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      is_set: false,
    })
    Assertions.assertSuccess(unsetRes, 'set_group_member_admin (unset)')
  }, 30000)

  it('set_group_member_mute: 禁言 secondary 60s 然后立刻解禁', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const muteRes = await primary.call('set_group_member_mute', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      duration: 60,
    })
    Assertions.assertSuccess(muteRes, 'set_group_member_mute (mute)')
    await new Promise((r) => setTimeout(r, 800))
    const unmuteRes = await primary.call('set_group_member_mute', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      duration: 0,
    })
    Assertions.assertSuccess(unmuteRes, 'set_group_member_mute (unmute)')
  }, 30000)

  it('set_group_whole_mute: 开/关全员禁言', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const onRes = await primary.call('set_group_whole_mute', {
      group_id: ctx.testGroupId,
      is_mute: true,
    })
    Assertions.assertSuccess(onRes, 'set_group_whole_mute (on)')
    await new Promise((r) => setTimeout(r, 800))
    const offRes = await primary.call('set_group_whole_mute', {
      group_id: ctx.testGroupId,
      is_mute: false,
    })
    Assertions.assertSuccess(offRes, 'set_group_whole_mute (off)')
  }, 30000)

  it('set_group_member_special_title: 给 secondary 设头衔再清掉', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const title = `Milky-${Date.now() % 10000}`
    const setRes = await primary.call('set_group_member_special_title', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      special_title: title,
    })
    Assertions.assertSuccess(setRes, 'set_group_member_special_title (set)')
    await new Promise((r) => setTimeout(r, 800))
    const clrRes = await primary.call('set_group_member_special_title', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      special_title: '',
    })
    Assertions.assertSuccess(clrRes, 'set_group_member_special_title (clear)')
  }, 30000)

  it('set_group_avatar: 设群头像（用现有图片）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('set_group_avatar', {
      group_id: ctx.testGroupId,
      image_uri: MediaPaths.testImageUri,
    })
    Assertions.assertSuccess(res, 'set_group_avatar')
  }, 30000)

  it('send_group_nudge: primary 群内戳 secondary（调用成功）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('send_group_nudge', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'send_group_nudge')
  }, 15000)

  // 破坏性，跳过：
  // - kick_group_member        — 会把 secondary 踢出测试群
  // - quit_group               — primary 退群
  // - accept/reject_group_request / accept/reject_group_invitation — 依赖第三方动作
})
