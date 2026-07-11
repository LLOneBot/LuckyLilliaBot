import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 撤回消息', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('recall_private_message: primary 撤回后双方都收到 message_recall (friend)', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-recall-priv-${Date.now()}`

    const sendRes = await primary.call<{ message_seq: number }>('send_private_message', {
      user_id: ctx.secondaryUserId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_private_message')
    const messageSeq = sendRes.data!.message_seq

    // 等 secondary 收到再撤
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'friend',
        sender_id: ctx.primaryUserId,
      },
      (e) => e.data?.segments?.some((s: any) => s.data?.text === text),
      15000,
    )
    await new Promise(r => setTimeout(r, 800))

    const recallRes = await primary.call('recall_private_message', {
      user_id: ctx.secondaryUserId,
      message_seq: messageSeq,
    })
    Assertions.assertSuccess(recallRes, 'recall_private_message')

    // primary 自己 + secondary 都应该收到 message_recall
    await Promise.all([
      ctx.twoAccountTest.primaryListener.waitForEvent(
        {
          event_type: 'message_recall',
          message_scene: 'friend',
          message_seq: messageSeq,
        },
        undefined,
        15000,
      ),
      ctx.twoAccountTest.secondaryListener.waitForEvent(
        {
          event_type: 'message_recall',
          message_scene: 'friend',
          sender_id: ctx.primaryUserId,
        },
        undefined,
        15000,
      ),
    ])
  }, 60000)

  it('recall_group_message: primary 撤回群消息后双方都收到 message_recall (group)', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-recall-grp-${Date.now()}`

    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    const messageSeq = sendRes.data!.message_seq

    // 等 secondary 收到
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'group',
        peer_id: ctx.testGroupId,
        message_seq: messageSeq,
      },
      undefined,
      15000,
    )
    await new Promise(r => setTimeout(r, 800))

    const recallRes = await primary.call('recall_group_message', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
    })
    Assertions.assertSuccess(recallRes, 'recall_group_message')

    await Promise.all([
      ctx.twoAccountTest.primaryListener.waitForEvent(
        {
          event_type: 'message_recall',
          message_scene: 'group',
          peer_id: ctx.testGroupId,
          message_seq: messageSeq,
        },
        undefined,
        15000,
      ),
      ctx.twoAccountTest.secondaryListener.waitForEvent(
        {
          event_type: 'message_recall',
          message_scene: 'group',
          peer_id: ctx.testGroupId,
          message_seq: messageSeq,
        },
        undefined,
        15000,
      ),
    ])
  }, 60000)
})
