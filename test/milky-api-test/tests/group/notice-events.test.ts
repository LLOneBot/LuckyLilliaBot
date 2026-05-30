/**
 * Milky 事件覆盖测试 — 非破坏性事件全覆盖。
 *
 * **观察 1**：milky adapter 之前 nt/message-created handler 用
 * `senderUid === selfInfo.uid && !reportSelfMessage` 整段 early return，
 * 把群操作的 grayTip 系统消息（mute / admin / nudge / file_upload …
 * senderUid 是发起人 uid）一并拦截了。已修成 guard 只挡 message_receive，
 * transformXxxEvent 一直走。
 *
 * **观察 2**：QQ NT server 对很多群操作类系统消息**只下发给被操作方 / 群里其他成员**，
 * 不下发给"操作发起人"。所以这里测试都从 secondary（被操作方）角度断言事件到达，
 * 跟 OB11 的 notice-events 测试策略保持一致。
 *
 * **跳过（破坏性 / 跨第三方）**：
 * - bot_offline                         — 需要把 bot 弄下线
 * - friend_request / friend_file_upload — 加好友 / 私聊文件流，依赖第三方
 * - group_invitation / group_*_join_request /
 *   group_member_increase / group_member_decrease
 *                                       — 邀请 / 入群 / 退群，破坏 fixture
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

  it.skip('group_name_change — server 不下发本端 grayTip / 系统消息，等服务端行为变了再启用', async () => {
    // 注：milky transform 已实现（grayTipElement.groupElement.type === 5），但 server
    // 改群名后既不给操作发起人下发 grayTip，也不给群里其它成员下发 nt/raw/group-name-update
    // 之类细粒度事件。OB11 端也没暴露这个 notice，整条链路是死的。
  })

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

  it.skip('peer_pin_change — server 不下发本端会话置顶变更系统消息', async () => {
    // 注：milky transformSystemMessageEvent 已实现（msgType=528 subType=39 + body.type=7），
    // 但 set_peer_pin API 调用成功后 server 不下发对应系统消息给本端 (实测两端都收不到)。
    // 等 server 行为或 nt 协议层暴露独立事件后再启用。
  })

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
