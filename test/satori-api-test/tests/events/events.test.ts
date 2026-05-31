/**
 * Satori event 端到端测试。
 *
 * Satori 协议定义的 event types：
 *   - message-created / message-deleted / message-updated
 *   - reaction-added / reaction-removed
 *   - guild-added / guild-removed / guild-request
 *   - guild-member-added / guild-member-removed / guild-member-request
 *   - friend-request / login-added / login-removed / ...
 *
 * 这里覆盖**非破坏性**事件 — message-created / message-deleted 已经在 message.test.ts 里
 * 间接验过；这里专门测 reaction 事件 + 显式重测 message 事件 shape。
 *
 * 跳过：
 *   - guild-added / guild-removed / guild-member-* / friend-request — 需要拉/踢人 / 加好友等破坏性操作
 *   - login-added / login-removed — 需要换号
 */
import { setupSatoriTest, teardownSatoriTest, SatoriTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Satori 事件覆盖', () => {
  let ctx: SatoriTestContext

  beforeAll(async () => {
    ctx = await setupSatoriTest()
  })

  afterAll(() => {
    teardownSatoriTest(ctx)
  })

  it('message-created 事件 shape：含 channel/guild/user/message 必填字段', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `evt-msg-${Date.now()}`
    await primary.call('message.create', { channel_id: ctx.testGroupId, content: text })

    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => String(e.channel?.id) === ctx.testGroupId && e.message?.content?.includes(text),
      15000,
    )
    expect(ev.timestamp).toBeGreaterThan(0)
    expect(String(ev.user?.id)).toBe(ctx.primaryUserId)
    expect(String(ev.channel?.id)).toBe(ctx.testGroupId)
    expect(String(ev.guild?.id)).toBe(ctx.testGroupId)
    expect(typeof ev.message?.id).toBe('string')
    expect(ev.message?.content).toContain(text)
    expect(typeof ev.message?.created_at).toBe('number')
  }, 30000)

  it('message-deleted 事件 shape：撤回后双方都收到，含 message.id', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `evt-del-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: text,
    })
    Assertions.assertSuccess(sendRes, 'message.create')
    const messageId = sendRes.data![0].id

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.message?.content?.includes(text),
      15000,
    )
    await new Promise(r => setTimeout(r, 800))

    await primary.call('message.delete', { channel_id: ctx.testGroupId, message_id: messageId })

    const [evP, evS] = await Promise.all([
      ctx.twoAccountTest.primaryListener.waitForEvent(
        { type: 'message-deleted' },
        (e: any) => String(e.channel?.id) === ctx.testGroupId && String(e.message?.id) === messageId,
        15000,
      ),
      ctx.twoAccountTest.secondaryListener.waitForEvent(
        { type: 'message-deleted' },
        (e: any) => String(e.channel?.id) === ctx.testGroupId && String(e.message?.id) === messageId,
        15000,
      ),
    ])
    expect(String(evP.message?.id)).toBe(messageId)
    expect(String(evS.message?.id)).toBe(messageId)
  }, 60000)

  it('reaction-added 事件：primary 给群消息加表情，secondary 收到 reaction-added', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `evt-react-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: text,
    })
    Assertions.assertSuccess(sendRes, 'message.create (for reaction)')
    const messageId = sendRes.data![0].id
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.message?.content?.includes(text),
      15000,
    )
    await new Promise(r => setTimeout(r, 500))

    // satori reaction.create
    const reactRes = await primary.call('reaction.create', {
      channel_id: ctx.testGroupId,
      message_id: messageId,
      emoji_id: '4',
    })
    Assertions.assertSuccess(reactRes, 'reaction.create')

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'reaction-added' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        String(e.user?.id) === ctx.primaryUserId &&
        String(e.message?.id) === messageId,
      15000,
    )
  }, 60000)

  it('reaction-removed 事件：primary 取消刚加的表情，secondary 收到 reaction-removed', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `evt-unreact-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: text,
    })
    Assertions.assertSuccess(sendRes, 'message.create (for reaction-removed)')
    const messageId = sendRes.data![0].id
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.message?.content?.includes(text),
      15000,
    )
    await new Promise(r => setTimeout(r, 500))

    // 先加再取消
    const addRes = await primary.call('reaction.create', {
      channel_id: ctx.testGroupId,
      message_id: messageId,
      emoji_id: '4',
    })
    Assertions.assertSuccess(addRes, 'reaction.create (preceding remove)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'reaction-added' },
      (e: any) => String(e.message?.id) === messageId,
      15000,
    )

    const delRes = await primary.call('reaction.delete', {
      channel_id: ctx.testGroupId,
      message_id: messageId,
      emoji_id: '4',
    })
    Assertions.assertSuccess(delRes, 'reaction.delete')

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'reaction-removed' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        String(e.user?.id) === ctx.primaryUserId &&
        String(e.message?.id) === messageId,
      15000,
    )
  }, 60000)
})
