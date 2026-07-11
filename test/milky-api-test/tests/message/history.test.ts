import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 历史消息', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('get_message: 发一条群消息后能用 (group, message_seq) 取回', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-history-${Date.now()}`
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    await new Promise((r) => setTimeout(r, 1000))

    const res = await primary.call<{ message: { segments: any[] } }>('get_message', {
      message_scene: 'group',
      peer_id: ctx.testGroupId,
      message_seq: sendRes.data!.message_seq,
    })
    Assertions.assertSuccess(res, 'get_message')
    expect(
      res.data?.message?.segments?.some((s: any) => s.type === 'text' && s.data?.text === text),
    ).toBe(true)
  }, 30000)

  it('get_history_messages: 能拉到一段群历史', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ messages: any[] }>('get_history_messages', {
      message_scene: 'group',
      peer_id: ctx.testGroupId,
      limit: 5,
    })
    Assertions.assertSuccess(res, 'get_history_messages')
    expect(Array.isArray(res.data?.messages)).toBe(true)
  }, 30000)
})
