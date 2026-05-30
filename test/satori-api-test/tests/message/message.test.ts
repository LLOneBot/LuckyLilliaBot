import { setupSatoriTest, teardownSatoriTest, SatoriTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Satori 消息发送 / 接收', () => {
  let ctx: SatoriTestContext

  beforeAll(async () => {
    ctx = await setupSatoriTest()
  })

  afterAll(() => {
    teardownSatoriTest(ctx)
  })

  it('message.create: 发群文本，secondary 收到 message-created 事件', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `satori-group-${Date.now()}`

    // satori content 是 XML 风格字符串；最简单的纯文本就是直接给文字
    const res = await primary.call<Array<{ id: string; channel: { id: string } }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: text,
    })
    Assertions.assertSuccess(res, 'message.create (group)')
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data!.length).toBeGreaterThan(0)
    const sent = res.data![0]
    expect(typeof sent.id).toBe('string')
    expect(sent.channel?.id).toBe(ctx.testGroupId)

    // secondary 收到 message-created 事件
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.channel?.id === ctx.testGroupId && e.message?.content?.includes(text),
      15000,
    )
    expect(ev.user?.id).toBe(ctx.primaryUserId)
    expect(ev.message?.content).toContain(text)
  }, 30000)

  it('message.create: 发私聊文本（channel_id="private:<uin>"），secondary 收到', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `satori-priv-${Date.now()}`
    const res = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: `private:${ctx.secondaryUserId}`,
      content: text,
    })
    Assertions.assertSuccess(res, 'message.create (private)')
    expect(res.data!.length).toBeGreaterThan(0)

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.user?.id === ctx.primaryUserId && e.message?.content?.includes(text),
      15000,
    )
  }, 30000)

  it('message.create: 发 mention secondary，事件里包含 at 元素', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `satori-mention-${Date.now()}`
    // satori content 是 XML：<at id="..."/> 表示 mention
    const content = `<at id="${ctx.secondaryUserId}"/> ${text}`
    const res = await primary.call('message.create', {
      channel_id: ctx.testGroupId,
      content,
    })
    Assertions.assertSuccess(res, 'message.create (mention)')

    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => {
        if (e.channel?.id !== ctx.testGroupId) return false
        const msg = e.message?.content ?? ''
        return msg.includes(text) && msg.includes(`<at id="${ctx.secondaryUserId}"`)
      },
      15000,
    )
  }, 30000)

  it('message.delete: 撤回自己刚发的群消息', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `satori-delete-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: text,
    })
    Assertions.assertSuccess(sendRes, 'message.create (for delete)')
    const messageId = sendRes.data![0].id

    // 等 secondary 收到先（确保 server 入库）
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.message?.content?.includes(text),
      15000,
    )
    await new Promise(r => setTimeout(r, 800))

    const delRes = await primary.call('message.delete', {
      channel_id: ctx.testGroupId,
      message_id: messageId,
    })
    Assertions.assertSuccess(delRes, 'message.delete')

    // 双方都应该收到 message-deleted 事件
    await Promise.all([
      ctx.twoAccountTest.primaryListener.waitForEvent(
        { type: 'message-deleted' },
        (e: any) => e.channel?.id === ctx.testGroupId && e.message?.id === messageId,
        15000,
      ),
      ctx.twoAccountTest.secondaryListener.waitForEvent(
        { type: 'message-deleted' },
        (e: any) => e.channel?.id === ctx.testGroupId && e.message?.id === messageId,
        15000,
      ),
    ])
  }, 60000)

  it('message.get: 用 channel_id + message_id 拉回刚发的消息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `satori-msgget-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: text,
    })
    Assertions.assertSuccess(sendRes, 'message.create (for get)')
    const messageId = sendRes.data![0].id
    await new Promise(r => setTimeout(r, 800))

    const res = await primary.call<{ id: string; content: string }>('message.get', {
      channel_id: ctx.testGroupId,
      message_id: messageId,
    })
    Assertions.assertSuccess(res, 'message.get')
    expect(res.data?.id).toBe(messageId)
    expect(res.data?.content).toContain(text)
  }, 30000)
})
