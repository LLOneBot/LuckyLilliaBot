/**
 * Milky 非破坏性事件。很多群操作的系统消息只发给被操作方和群里其他人, 不发给发起人, 所以都从 secondary
 * 的角度断言 (跟 OB11 的 notice-events 一样)。没测 (破坏性 / 依赖第三方): bot_offline、friend_request、
 * friend_file_upload、group_invitation、group_*_join_request、group_member_increase / decrease
 */
import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'
import { MediaPaths } from '../media'

describe('Milky 事件覆盖', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('message_receive — 私聊 + 群聊 send 后 secondary 收到 shape 对的 event', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const ts = Date.now()

    await primary.call('send_private_message', {
      user_id: ctx.secondaryUserId,
      message: [{ type: 'text', data: { text: `mr-priv-${ts}` } }],
    })
    const ev1 = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'friend', sender_id: ctx.primaryUserId },
      (e) => e.data?.segments?.some((s: any) => s.data?.text === `mr-priv-${ts}`),
      15000,
    )
    Assertions.assertDefined(ev1.data?.message_seq, 'message_receive.data.message_seq')

    await primary.call('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text: `mr-grp-${ts}` } }],
    })
    const ev2 = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId },
      (e) => e.data?.segments?.some((s: any) => s.data?.text === `mr-grp-${ts}`),
      15000,
    )
    Assertions.assertDefined(ev2.data?.message_seq, 'message_receive(group).data.message_seq')
  }, 60000)

  it('friend_nudge — primary 戳 secondary，secondary 收到 friend_nudge', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('send_friend_nudge', { user_id: ctx.secondaryUserId, is_self: false })
    Assertions.assertSuccess(res, 'send_friend_nudge')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'friend_nudge' }, undefined, 15000,
    )
  }, 30000)

  it('group_nudge — primary 群里戳 secondary，secondary 收到 group_nudge', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call('send_group_nudge', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'send_group_nudge')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_nudge', group_id: ctx.testGroupId, sender_id: ctx.primaryUserId, receiver_id: ctx.secondaryUserId },
      undefined, 15000,
    )
  }, 30000)

  it('group_message_reaction — primary 加表情，secondary 收到 reaction (is_add=true)', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `react-tgt-${Date.now()}`
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    const messageSeq = sendRes.data!.message_seq

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: messageSeq },
      undefined, 15000,
    )
    await new Promise(r => setTimeout(r, 500))

    const reactRes = await primary.call('send_group_message_reaction', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      reaction: '4',
      reaction_type: 'face',
      is_add: true,
    })
    Assertions.assertSuccess(reactRes, 'send_group_message_reaction')

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'group_message_reaction',
        group_id: ctx.testGroupId,
        message_seq: messageSeq,
        user_id: ctx.primaryUserId,
        is_add: true,
      },
      undefined, 15000,
    )

    await primary.call('send_group_message_reaction', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      reaction: '4',
      reaction_type: 'face',
      is_add: false,
    }).catch(() => undefined)
  }, 60000)

  it('group_name_change — primary 改群名，secondary 收到 group_name_change', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const newName = `MilkyEvt_${Date.now()}`
    const res = await primary.call('set_group_name', { group_id: ctx.testGroupId, new_group_name: newName })
    Assertions.assertSuccess(res, 'set_group_name')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_name_change', group_id: ctx.testGroupId, new_group_name: newName, operator_id: ctx.primaryUserId },
      undefined, 15000,
    )
  }, 30000)

  it('group_admin_change — primary 设/取消 secondary 管理员，secondary 都收到 group_admin_change', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')

    const setRes = await primary.call('set_group_member_admin', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      is_set: true,
    })
    Assertions.assertSuccess(setRes, 'set_group_member_admin (set)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_admin_change', group_id: ctx.testGroupId, user_id: ctx.secondaryUserId, is_set: true },
      undefined, 20000,
    )
    await new Promise(r => setTimeout(r, 1500))

    ctx.twoAccountTest.clearAllQueues()
    const unsetRes = await primary.call('set_group_member_admin', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      is_set: false,
    })
    Assertions.assertSuccess(unsetRes, 'set_group_member_admin (unset)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_admin_change', group_id: ctx.testGroupId, user_id: ctx.secondaryUserId, is_set: false },
      undefined, 20000,
    )
  }, 90000)

  it('group_mute — primary 禁言/解禁 secondary，secondary 收到 group_mute', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')

    const muteRes = await primary.call('set_group_member_mute', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      duration: 60,
    })
    Assertions.assertSuccess(muteRes, 'set_group_member_mute (mute)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_mute', group_id: ctx.testGroupId, user_id: ctx.secondaryUserId },
      (e) => e.data?.duration > 0,
      15000,
    )
    await new Promise(r => setTimeout(r, 1000))

    ctx.twoAccountTest.clearAllQueues()
    const unmuteRes = await primary.call('set_group_member_mute', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      duration: 0,
    })
    Assertions.assertSuccess(unmuteRes, 'set_group_member_mute (unmute)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_mute', group_id: ctx.testGroupId, user_id: ctx.secondaryUserId },
      (e) => e.data?.duration === 0,
      15000,
    )
  }, 60000)

  it('group_whole_mute — primary 开/关全员禁言，secondary 收到 group_whole_mute', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')

    const onRes = await primary.call('set_group_whole_mute', { group_id: ctx.testGroupId, is_mute: true })
    Assertions.assertSuccess(onRes, 'set_group_whole_mute (on)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_whole_mute', group_id: ctx.testGroupId, is_mute: true },
      undefined, 15000,
    )
    await new Promise(r => setTimeout(r, 1000))

    ctx.twoAccountTest.clearAllQueues()
    const offRes = await primary.call('set_group_whole_mute', { group_id: ctx.testGroupId, is_mute: false })
    Assertions.assertSuccess(offRes, 'set_group_whole_mute (off)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_whole_mute', group_id: ctx.testGroupId, is_mute: false },
      undefined, 15000,
    )
  }, 60000)

  it('group_essence_message_change — primary 设/取消精华，secondary 收到事件', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `essence-${Date.now()}`
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    const messageSeq = sendRes.data!.message_seq

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: messageSeq },
      undefined, 15000,
    )
    await new Promise(r => setTimeout(r, 500))

    ctx.twoAccountTest.clearAllQueues()
    const setRes = await primary.call('set_group_essence_message', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      is_set: true,
    })
    Assertions.assertSuccess(setRes, 'set_group_essence_message (add)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_essence_message_change', group_id: ctx.testGroupId, message_seq: messageSeq, is_set: true },
      undefined, 15000,
    )
    await new Promise(r => setTimeout(r, 1000))

    ctx.twoAccountTest.clearAllQueues()
    const unsetRes = await primary.call('set_group_essence_message', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      is_set: false,
    })
    Assertions.assertSuccess(unsetRes, 'set_group_essence_message (remove)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_essence_message_change', group_id: ctx.testGroupId, message_seq: messageSeq, is_set: false },
      undefined, 15000,
    )
  }, 90000)

  it('peer_pin_change — primary 设/取消会话置顶，自己收到 peer_pin_change', async () => {
    // 推给自己 (OlPush 528 / 39, body.type=7), milky 从 sysmsg 产出 peer_pin_change
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')

    const pinRes = await primary.call('set_peer_pin', {
      message_scene: 'friend',
      peer_id: ctx.secondaryUserId,
      is_pinned: true,
    })
    Assertions.assertSuccess(pinRes, 'set_peer_pin (pin)')
    await ctx.twoAccountTest.primaryListener.waitForEvent(
      { event_type: 'peer_pin_change', message_scene: 'friend', peer_id: ctx.secondaryUserId, is_pinned: true },
      undefined, 15000,
    )
    await new Promise(r => setTimeout(r, 800))

    ctx.twoAccountTest.clearAllQueues()
    const unpinRes = await primary.call('set_peer_pin', {
      message_scene: 'friend',
      peer_id: ctx.secondaryUserId,
      is_pinned: false,
    })
    Assertions.assertSuccess(unpinRes, 'set_peer_pin (unpin)')
    await ctx.twoAccountTest.primaryListener.waitForEvent(
      { event_type: 'peer_pin_change', message_scene: 'friend', peer_id: ctx.secondaryUserId, is_pinned: false },
      undefined, 15000,
    )
  }, 30000)

  it('group_file_upload — primary 上群文件，secondary 收到 group_file_upload', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const fileName = `milky-file-evt-${Date.now()}.txt`
    const res = await primary.call<{ file_id: string }>('upload_group_file', {
      group_id: ctx.testGroupId,
      file_uri: MediaPaths.testGifUri,
      file_name: fileName,
    })
    Assertions.assertSuccess(res, 'upload_group_file')

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'group_file_upload', group_id: ctx.testGroupId },
      (e) => e.data?.file_name === fileName,
      20000,
    )

    if (res.data?.file_id) {
      await primary.call('delete_group_file', {
        group_id: ctx.testGroupId,
        file_id: res.data.file_id,
      }).catch(() => undefined)
    }
  }, 60000)
})
