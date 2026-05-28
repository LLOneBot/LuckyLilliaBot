import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 群消息', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('send_group_message: primary 发到群后 secondary 收到 message_receive', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-group-${Date.now()}`

    const sendRes = await primary.call<{ message_seq: number; time: number }>(
      'send_group_message',
      {
        group_id: ctx.testGroupId,
        message: [{ type: 'text', data: { text } }],
      },
    )
    Assertions.assertSuccess(sendRes, 'send_group_message')
    expect(sendRes.data?.message_seq).toBeGreaterThan(0)
    const messageSeq = sendRes.data!.message_seq

    // secondary 收到群消息
    const event = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'group',
        peer_id: ctx.testGroupId,
        sender_id: ctx.primaryUserId,
        message_seq: messageSeq,
      },
      undefined,
      15000,
    )
    expect(
      event.data.segments?.some((s: any) => s.type === 'text' && s.data?.text === text),
    ).toBe(true)
  }, 30000)

  it('支持 mention 段：mention secondary，secondary 端收到 mention 段', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-mention-${Date.now()}`

    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [
        { type: 'mention', data: { user_id: ctx.secondaryUserId } },
        { type: 'text', data: { text: ` ${text}` } },
      ],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')

    const event = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'group',
        peer_id: ctx.testGroupId,
        sender_id: ctx.primaryUserId,
        message_seq: sendRes.data!.message_seq,
      },
      undefined,
      15000,
    )
    const hasMention = event.data.segments?.some(
      (s: any) => s.type === 'mention' && s.data?.user_id === ctx.secondaryUserId,
    )
    expect(hasMention).toBe(true)
  }, 30000)
})
