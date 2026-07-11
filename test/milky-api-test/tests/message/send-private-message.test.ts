import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 私聊消息', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('send_private_message: primary 发给 secondary 后 secondary 收到 message_receive', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-private-${Date.now()}`

    const sendRes = await primary.call<{ message_seq: number; time: number }>(
      'send_private_message',
      {
        user_id: ctx.secondaryUserId,
        message: [{ type: 'text', data: { text } }],
      },
    )
    Assertions.assertSuccess(sendRes, 'send_private_message')
    expect(sendRes.data?.message_seq).toBeGreaterThan(0)

    // secondary 端收到 message_receive
    const event = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'friend',
        sender_id: ctx.primaryUserId,
      },
      (e) => {
        // 数据里 segments[0].data.text 跟我们发的一致
        return e.data?.segments?.some((s: any) => s.type === 'text' && s.data?.text === text)
      },
      15000,
    )
    expect(event.data.peer_id).toBe(ctx.primaryUserId) // friend 场景下 secondary 视角的 peer_id 是对方
    expect(event.data.message_seq).toBeGreaterThan(0)
  }, 30000)
})
