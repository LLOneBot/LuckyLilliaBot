/**
 * message_receive 多 segment 类型覆盖测试。
 *
 * milky 协议支持的 outgoing segment 类型：
 *   text, mention, mention_all, face, image, record, video,
 *   reply, forward, light_app  （market_face / xml 不在 outgoing schema 里，receive only）
 *
 * 这里：
 *   - 发各种 segment → 确认 secondary 收到的 message_receive 里 segments 包含对应 type
 *   - 把 send + receive 端到端验证（send_*_message 的 message_seq → 等 secondary 收到对应 seq）
 *
 * 文件 / video / record 用 onebot11-api-test 共享的 fixture（test/onebot11-api-test/tests/media/）
 */
import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'
import { MediaPaths } from '../media'

describe('Milky message_receive：多 segment 类型覆盖', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  /** 通用：primary 发一条群消息 → 等 secondary 收到 message_receive，回 segments 数组 */
  async function sendGroupAndAwait(segments: any[], extraTimeoutMs = 15000): Promise<any[]> {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: segments,
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    const messageSeq = sendRes.data!.message_seq
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'group',
        peer_id: ctx.testGroupId,
        sender_id: ctx.primaryUserId,
        message_seq: messageSeq,
      },
      undefined,
      extraTimeoutMs,
    )
    return ev.data?.segments ?? []
  }

  async function sendPrivateAndAwait(segments: any[], extraTimeoutMs = 15000): Promise<any[]> {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<{ message_seq: number }>('send_private_message', {
      user_id: ctx.secondaryUserId,
      message: segments,
    })
    Assertions.assertSuccess(sendRes, 'send_private_message')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      {
        event_type: 'message_receive',
        message_scene: 'friend',
        sender_id: ctx.primaryUserId,
      },
      (e) => e.data?.message_seq === sendRes.data!.message_seq,
      extraTimeoutMs,
    )
    return ev.data?.segments ?? []
  }

  // ---------- 群聊 ----------

  it('text 段：纯文本', async () => {
    const text = `seg-text-${Date.now()}`
    const segs = await sendGroupAndAwait([{ type: 'text', data: { text } }])
    expect(segs.some((s: any) => s.type === 'text' && s.data?.text === text)).toBe(true)
  }, 30000)

  it('mention 段：@ secondary', async () => {
    const text = `seg-mention-${Date.now()}`
    const segs = await sendGroupAndAwait([
      { type: 'mention', data: { user_id: ctx.secondaryUserId } },
      { type: 'text', data: { text: ` ${text}` } },
    ])
    expect(segs.some((s: any) => s.type === 'mention' && s.data?.user_id === ctx.secondaryUserId)).toBe(true)
    expect(segs.some((s: any) => s.type === 'text' && s.data?.text?.includes(text))).toBe(true)
  }, 30000)

  it('mention_all 段：@全体成员', async () => {
    const text = `seg-mention_all-${Date.now()}`
    const segs = await sendGroupAndAwait([
      { type: 'mention_all', data: {} },
      { type: 'text', data: { text: ` ${text}` } },
    ])
    expect(segs.some((s: any) => s.type === 'mention_all')).toBe(true)
  }, 30000)

  it('face 段：QQ 表情', async () => {
    // face_id 4 = QQ 经典 "得意" 表情
    const tag = `seg-face-${Date.now()}`
    const segs = await sendGroupAndAwait([
      { type: 'face', data: { face_id: '4' } },
      { type: 'text', data: { text: tag } },
    ])
    expect(segs.some((s: any) => s.type === 'face' && String(s.data?.face_id) === '4')).toBe(true)
  }, 30000)

  it('image 段：发图', async () => {
    const tag = `seg-image-${Date.now()}`
    const segs = await sendGroupAndAwait([
      { type: 'image', data: { uri: MediaPaths.testImageUri } },
      { type: 'text', data: { text: tag } },
    ])
    expect(segs.some((s: any) => s.type === 'image')).toBe(true)
  }, 60000)

  it('record 段：发语音', async () => {
    const segs = await sendGroupAndAwait(
      [{ type: 'record', data: { uri: MediaPaths.testAudioUri } }],
      30000,
    )
    expect(segs.some((s: any) => s.type === 'record')).toBe(true)
  }, 60000)

  it('video 段：发视频', async () => {
    const segs = await sendGroupAndAwait(
      [{ type: 'video', data: { uri: MediaPaths.freshVideoUri } }],
      45000,
    )
    expect(segs.some((s: any) => s.type === 'video')).toBe(true)
  }, 90000)

  it('reply 段：回复一条群消息', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    // 先发一条普通消息
    const baseRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text: `seg-reply-base-${Date.now()}` } }],
    })
    Assertions.assertSuccess(baseRes, 'send_group_message (base)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: baseRes.data!.message_seq },
      undefined, 15000,
    )
    await new Promise(r => setTimeout(r, 500))

    // 再 reply 它
    const segs = await sendGroupAndAwait([
      { type: 'reply', data: { message_seq: baseRes.data!.message_seq } },
      { type: 'text', data: { text: `reply-back-${Date.now()}` } },
    ])
    expect(segs.some((s: any) => s.type === 'reply' && s.data?.message_seq === baseRes.data!.message_seq)).toBe(true)
  }, 60000)

  it('forward 段：发合并转发，秒回 forward_id 即视为发送成功', async () => {
    // milky outgoing forward segment 是直接 inline messages 数组
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<{ forward_id?: string; message_seq?: number }>(
      'send_group_message',
      {
        group_id: ctx.testGroupId,
        message: [
          {
            type: 'forward',
            data: {
              messages: [
                {
                  user_id: ctx.primaryUserId,
                  sender_name: 'milky-test',
                  segments: [{ type: 'text', data: { text: `inline-1-${Date.now()}` } }],
                },
                {
                  user_id: ctx.primaryUserId,
                  sender_name: 'milky-test',
                  segments: [{ type: 'text', data: { text: `inline-2-${Date.now()}` } }],
                },
              ],
            },
          },
        ],
      },
    )
    Assertions.assertSuccess(sendRes, 'send_group_message (forward)')
    expect(typeof sendRes.data?.forward_id === 'string' || sendRes.data?.message_seq).toBeTruthy()

    // secondary 收到 message_receive 里包含 forward 段
    if (sendRes.data?.message_seq) {
      const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
        { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: sendRes.data.message_seq },
        undefined, 15000,
      )
      const segs = ev.data?.segments ?? []
      expect(segs.some((s: any) => s.type === 'forward')).toBe(true)
    }
  }, 60000)

  // ---------- 私聊 ----------

  it('text 段：私聊文本', async () => {
    const text = `priv-text-${Date.now()}`
    const segs = await sendPrivateAndAwait([{ type: 'text', data: { text } }])
    expect(segs.some((s: any) => s.type === 'text' && s.data?.text === text)).toBe(true)
  }, 30000)

  it('image 段：私聊发图', async () => {
    const segs = await sendPrivateAndAwait(
      [{ type: 'image', data: { uri: MediaPaths.testImageUri } }],
      30000,
    )
    expect(segs.some((s: any) => s.type === 'image')).toBe(true)
  }, 60000)

  it('face 段：私聊表情', async () => {
    const segs = await sendPrivateAndAwait([
      { type: 'face', data: { face_id: '4' } },
      { type: 'text', data: { text: `priv-face-${Date.now()}` } },
    ])
    expect(segs.some((s: any) => s.type === 'face')).toBe(true)
  }, 30000)

  it('record 段：私聊语音', async () => {
    const segs = await sendPrivateAndAwait(
      [{ type: 'record', data: { uri: MediaPaths.testAudioUri } }],
      30000,
    )
    expect(segs.some((s: any) => s.type === 'record')).toBe(true)
  }, 60000)

  it('video 段：私聊视频', async () => {
    const segs = await sendPrivateAndAwait(
      [{ type: 'video', data: { uri: MediaPaths.freshVideoUri } }],
      45000,
    )
    expect(segs.some((s: any) => s.type === 'video')).toBe(true)
  }, 90000)

  it('reply 段：私聊回复', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const baseRes = await primary.call<{ message_seq: number }>('send_private_message', {
      user_id: ctx.secondaryUserId,
      message: [{ type: 'text', data: { text: `priv-reply-base-${Date.now()}` } }],
    })
    Assertions.assertSuccess(baseRes, 'send_private_message (base)')
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'friend', sender_id: ctx.primaryUserId },
      (e) => e.data?.message_seq === baseRes.data!.message_seq,
      15000,
    )
    await new Promise(r => setTimeout(r, 500))

    const segs = await sendPrivateAndAwait([
      { type: 'reply', data: { message_seq: baseRes.data!.message_seq } },
      { type: 'text', data: { text: `priv-reply-back-${Date.now()}` } },
    ])
    expect(segs.some((s: any) => s.type === 'reply' && s.data?.message_seq === baseRes.data!.message_seq)).toBe(true)
  }, 60000)

  it('forward 段：私聊合并转发', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const ts = Date.now()
    const sendRes = await primary.call<{ forward_id?: string; message_seq?: number }>(
      'send_private_message',
      {
        user_id: ctx.secondaryUserId,
        message: [
          {
            type: 'forward',
            data: {
              messages: [
                {
                  user_id: ctx.primaryUserId,
                  sender_name: 'milky-test',
                  segments: [{ type: 'text', data: { text: `priv-fwd-1-${ts}` } }],
                },
                {
                  user_id: ctx.primaryUserId,
                  sender_name: 'milky-test',
                  segments: [{ type: 'text', data: { text: `priv-fwd-2-${ts}` } }],
                },
              ],
            },
          },
        ],
      },
    )
    Assertions.assertSuccess(sendRes, 'send_private_message (forward)')
    expect(typeof sendRes.data?.forward_id === 'string' || sendRes.data?.message_seq).toBeTruthy()

    if (sendRes.data?.message_seq) {
      const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
        { event_type: 'message_receive', message_scene: 'friend', sender_id: ctx.primaryUserId },
        (e) => e.data?.message_seq === sendRes.data!.message_seq,
        15000,
      )
      const segs = ev.data?.segments ?? []
      expect(segs.some((s: any) => s.type === 'forward')).toBe(true)
    }
  }, 60000)
})
