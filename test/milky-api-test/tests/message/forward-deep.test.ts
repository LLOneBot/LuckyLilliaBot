/** 合并转发的边角场景, 基础场景在 segment-types.test.ts */
import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'
import { MediaPaths } from '../media'

describe('Milky 合并转发深度测试', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  /** 等 secondary 收到 (入库) 再返回 message_seq */
  async function sendAndWait(segments: any[]): Promise<number> {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const r = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: segments,
    })
    Assertions.assertSuccess(r, 'send_group_message')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: r.data!.message_seq },
      undefined, 15000,
    )
    await new Promise(rs => setTimeout(rs, 500))
    return r.data!.message_seq
  }

  async function pullForward(forwardId: string): Promise<any[]> {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ messages: any[] }>('get_forwarded_messages', { forward_id: forwardId })
    Assertions.assertSuccess(res, 'get_forwarded_messages')
    return res.data?.messages ?? []
  }

  async function sendForwardAndPull(messages: any[]): Promise<any[]> {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const r = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'forward', data: { messages } }],
    })
    Assertions.assertSuccess(r, 'send_group_message (forward)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: r.data!.message_seq },
      undefined, 20000,
    )
    const fwd = (ev.data?.segments ?? []).find((s: any) => s.type === 'forward')
    expect(fwd?.data?.forward_id).toBeDefined()
    return await pullForward(fwd.data.forward_id)
  }

  // inline 的 reply 是 server 组装的快照, 锚点内容 best-effort, 只校验 reply 段存在且 message_seq 对
  it('inline reply 锚点是图片消息：reply 段存在且 message_seq 正确', async () => {
    const ts = Date.now()
    const anchorSeq = await sendAndWait([
      { type: 'image', data: { uri: MediaPaths.testImageUri } },
      { type: 'text', data: { text: `image-anchor-${ts}` } },
    ])

    const messages = await sendForwardAndPull([
      {
        user_id: ctx.primaryUserId,
        sender_name: '回复图片',
        segments: [
          { type: 'reply', data: { message_seq: anchorSeq } },
          { type: 'text', data: { text: `引用图片 ${ts}` } },
        ],
      },
    ])
    const replySeg = messages[0].segments.find((s: any) => s.type === 'reply')
    expect(replySeg).toBeDefined()
    expect(replySeg.data?.message_seq).toBe(anchorSeq)
    // 外层 forward 节点本身的 text 段必须保留
    const outerTexts = messages[0].segments.filter((s: any) => s.type === 'text').map((s: any) => s.data?.text)
    expect(outerTexts.some((t: string) => t.includes(`引用图片 ${ts}`))).toBe(true)
  }, 90000)

  it('inline reply 锚点是视频消息：reply 段存在且 message_seq 正确', async () => {
    const ts = Date.now()
    const anchorSeq = await sendAndWait([
      { type: 'video', data: { uri: MediaPaths.freshVideoUri } },
    ])

    const messages = await sendForwardAndPull([
      {
        user_id: ctx.primaryUserId,
        sender_name: '回复视频',
        segments: [
          { type: 'reply', data: { message_seq: anchorSeq } },
          { type: 'text', data: { text: `引用视频 ${ts}` } },
        ],
      },
    ])
    const replySeg = messages[0].segments.find((s: any) => s.type === 'reply')
    expect(replySeg).toBeDefined()
    expect(replySeg.data?.message_seq).toBe(anchorSeq)
  }, 120000)

  it('inline reply 锚点是语音消息：reply 段存在且 message_seq 正确', async () => {
    const ts = Date.now()
    const anchorSeq = await sendAndWait([
      { type: 'record', data: { uri: MediaPaths.testAudioUri } },
    ])

    const messages = await sendForwardAndPull([
      {
        user_id: ctx.primaryUserId,
        sender_name: '回复语音',
        segments: [
          { type: 'reply', data: { message_seq: anchorSeq } },
          { type: 'text', data: { text: `引用语音 ${ts}` } },
        ],
      },
    ])
    const replySeg = messages[0].segments.find((s: any) => s.type === 'reply')
    expect(replySeg).toBeDefined()
    expect(replySeg.data?.message_seq).toBe(anchorSeq)
  }, 90000)

  it('inline 节点 sender_name / user_id 自定义：拉回时保留', async () => {
    // user_id 要 >= 10001 (milky schema 校验)
    const ts = Date.now()
    const messages = await sendForwardAndPull([
      {
        user_id: 100001,
        sender_name: '小可爱',
        segments: [{ type: 'text', data: { text: `小可爱说话 ${ts}` } }],
      },
      {
        user_id: 999999,
        sender_name: '路人甲',
        segments: [{ type: 'text', data: { text: `路人甲说话 ${ts}` } }],
      },
    ])
    expect(messages.length).toBe(2)
    expect(messages[0].sender_name).toBe('小可爱')
    expect(messages[1].sender_name).toBe('路人甲')
  }, 60000)

  it('嵌套合并转发：forward 段里包含另一个 forward 段', async () => {
    const ts = Date.now()
    const messages = await sendForwardAndPull([
      {
        user_id: ctx.primaryUserId,
        sender_name: 'outer-A',
        segments: [{ type: 'text', data: { text: `outer-text-${ts}` } }],
      },
      {
        user_id: ctx.primaryUserId,
        sender_name: 'outer-B-with-nested-forward',
        segments: [
          {
            type: 'forward',
            data: {
              messages: [
                {
                  user_id: ctx.primaryUserId,
                  sender_name: 'inner-X',
                  segments: [{ type: 'text', data: { text: `inner-text-1-${ts}` } }],
                },
                {
                  user_id: ctx.primaryUserId,
                  sender_name: 'inner-Y',
                  segments: [{ type: 'text', data: { text: `inner-text-2-${ts}` } }],
                },
              ],
            },
          },
        ],
      },
    ])
    expect(messages.length).toBe(2)
    expect(messages[0].sender_name).toBe('outer-A')
    expect(messages[1].sender_name).toBe('outer-B-with-nested-forward')

    // 节点 1 应该有一个嵌套 forward 段
    const innerFwd = messages[1].segments.find((s: any) => s.type === 'forward')
    expect(innerFwd).toBeDefined()
    expect(typeof innerFwd.data?.forward_id).toBe('string')
    expect(innerFwd.data.forward_id.length).toBeGreaterThan(0)

    // 拉嵌套的 forward_id 应当能拿到 inner-X / inner-Y 两条
    const innerMsgs = await pullForward(innerFwd.data.forward_id)
    expect(innerMsgs.length).toBe(2)
    expect(innerMsgs[0].sender_name).toBe('inner-X')
    expect(innerMsgs[1].sender_name).toBe('inner-Y')
    expect(innerMsgs[0].segments.some((s: any) => s.type === 'text' && s.data?.text === `inner-text-1-${ts}`)).toBe(true)
    expect(innerMsgs[1].segments.some((s: any) => s.type === 'text' && s.data?.text === `inner-text-2-${ts}`)).toBe(true)
  }, 120000)
})
