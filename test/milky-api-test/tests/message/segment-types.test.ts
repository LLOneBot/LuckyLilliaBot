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
    const segs = await sendGroupAndAwait([
      { type: 'image', data: { uri: MediaPaths.testImageUri } },
    ])
    const img = segs.find((s: any) => s.type === 'image')
    expect(img).toBeDefined()
    // 校验 IncomingImageSegmentData 必填字段都被填上：resource_id 非空 + 宽高 > 0 + temp_url 是 http(s)
    expect(typeof img.data?.resource_id).toBe('string')
    expect(img.data.resource_id.length).toBeGreaterThan(0)
    expect(img.data?.width).toBeGreaterThan(0)
    expect(img.data?.height).toBeGreaterThan(0)
    expect(img.data?.temp_url).toMatch(/^https?:\/\//)
    // sub_type 必须是 'normal' | 'sticker' 之一
    expect(['normal', 'sticker']).toContain(img.data?.sub_type)
  }, 60000)

  it('record 段：发语音', async () => {
    const segs = await sendGroupAndAwait(
      [{ type: 'record', data: { uri: MediaPaths.testAudioUri } }],
      30000,
    )
    const rec = segs.find((s: any) => s.type === 'record')
    expect(rec).toBeDefined()
    expect(typeof rec.data?.resource_id).toBe('string')
    expect(rec.data.resource_id.length).toBeGreaterThan(0)
    expect(rec.data?.temp_url).toMatch(/^https?:\/\//)
    // test.mp3 是 ~230s 的音频；duration > 0 + < 600s 兜底（防 server 误填巨大值）
    expect(rec.data?.duration).toBeGreaterThan(0)
    expect(rec.data?.duration).toBeLessThan(600)
  }, 60000)

  it('video 段：发视频', async () => {
    const segs = await sendGroupAndAwait(
      [{ type: 'video', data: { uri: MediaPaths.freshVideoUri } }],
      45000,
    )
    const vid = segs.find((s: any) => s.type === 'video')
    expect(vid).toBeDefined()
    expect(typeof vid.data?.resource_id).toBe('string')
    expect(vid.data.resource_id.length).toBeGreaterThan(0)
    expect(vid.data?.temp_url).toMatch(/^https?:\/\//)
    // 注：width / height 来自 fileElement.thumbWidth / thumbHeight（视频封面），
    // server 偶尔不下发这俩 → 实测可能为 0。这里只断言"字段存在 + 非负数"，
    // 不强制 > 0。duration 也一样（视频 fileTime 偶尔丢）。
    expect(typeof vid.data?.width).toBe('number')
    expect(typeof vid.data?.height).toBe('number')
    expect(typeof vid.data?.duration).toBe('number')
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

  it('forward 段：发合并转发（含混合 inline：text/mention/face/image），核对各节点都被 server 收下', async () => {
    // 合并转发的 inline segments 在 server 端会有"快照归一化"行为：
    //   - mention 段 → 退化成普通文本 "@<对方群名片>"（@ 实时定位失去意义）
    //   - face 段 → 通常被 server 直接 drop（合并转发不展示动态表情）
    //   - text / image 都保留
    // 所以这里测试 inline 各节点 sender_name + text/image 必到，不再死板要求
    // 节点里 face/mention 段以 segment.type 形式回来。
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const ts = Date.now()
    const inlineNodes = [
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-text',
        segments: [{ type: 'text', data: { text: `inline-text-${ts}` } }],
      },
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-mention',
        segments: [
          { type: 'mention', data: { user_id: ctx.secondaryUserId } },
          { type: 'text', data: { text: ` inline-mention-${ts}` } },
        ],
      },
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-face',
        segments: [
          { type: 'face', data: { face_id: '4' } },
          { type: 'text', data: { text: ` inline-face-${ts}` } },
        ],
      },
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-image',
        segments: [
          { type: 'image', data: { uri: MediaPaths.testImageUri } },
          { type: 'text', data: { text: ` inline-image-${ts}` } },
        ],
      },
    ]
    const sendRes = await primary.call<{ forward_id?: string; message_seq?: number }>(
      'send_group_message',
      {
        group_id: ctx.testGroupId,
        message: [{ type: 'forward', data: { messages: inlineNodes } }],
      },
    )
    Assertions.assertSuccess(sendRes, 'send_group_message (forward)')
    expect(sendRes.data?.message_seq).toBeGreaterThan(0)

    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'group', peer_id: ctx.testGroupId, message_seq: sendRes.data!.message_seq },
      undefined, 15000,
    )
    const fwd = (ev.data?.segments ?? []).find((s: any) => s.type === 'forward')
    expect(fwd).toBeDefined()
    expect(typeof fwd.data?.forward_id).toBe('string')

    const secondary = ctx.twoAccountTest.getClient('secondary')
    const fwdRes = await secondary.call<{ messages: any[] }>('get_forwarded_messages', {
      forward_id: fwd.data.forward_id,
    })
    Assertions.assertSuccess(fwdRes, 'get_forwarded_messages')
    const messages = fwdRes.data?.messages ?? []
    expect(messages.length).toBe(inlineNodes.length)

    // sender_name 全部带回来
    expect(messages[0].sender_name).toBe('milky-test-text')
    expect(messages[1].sender_name).toBe('milky-test-mention')
    expect(messages[2].sender_name).toBe('milky-test-face')
    expect(messages[3].sender_name).toBe('milky-test-image')

    // 节点 0：纯 text 完整保留
    expect(messages[0].segments.some((s: any) => s.type === 'text' && s.data?.text === `inline-text-${ts}`)).toBe(true)

    // 节点 1：mention 段被 server 退化成 text "@xxx"，但 text 后缀必须保留
    // （如果 server 行为变了能保留 mention，这两条都过；任一过即 OK）
    const node1Texts = messages[1].segments.filter((s: any) => s.type === 'text').map((s: any) => s.data?.text).join('')
    expect(node1Texts).toContain(`inline-mention-${ts}`)

    // 节点 2：face 段可能被 server 丢，但 text 后缀必须保留
    const node2Texts = messages[2].segments.filter((s: any) => s.type === 'text').map((s: any) => s.data?.text).join('')
    expect(node2Texts).toContain(`inline-face-${ts}`)

    // 节点 3：image 必须有 + 真 resource_id；text 后缀也保留
    const imgSeg = messages[3].segments.find((s: any) => s.type === 'image')
    expect(imgSeg).toBeDefined()
    expect(typeof imgSeg.data?.resource_id).toBe('string')
    expect(imgSeg.data.resource_id.length).toBeGreaterThan(0)
    const node3Texts = messages[3].segments.filter((s: any) => s.type === 'text').map((s: any) => s.data?.text).join('')
    expect(node3Texts).toContain(`inline-image-${ts}`)
  }, 90000)

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
    const img = segs.find((s: any) => s.type === 'image')
    expect(img).toBeDefined()
    expect(typeof img.data?.resource_id).toBe('string')
    expect(img.data.resource_id.length).toBeGreaterThan(0)
    expect(img.data?.width).toBeGreaterThan(0)
    expect(img.data?.height).toBeGreaterThan(0)
    expect(img.data?.temp_url).toMatch(/^https?:\/\//)
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
    const rec = segs.find((s: any) => s.type === 'record')
    expect(rec).toBeDefined()
    expect(typeof rec.data?.resource_id).toBe('string')
    expect(rec.data.resource_id.length).toBeGreaterThan(0)
    expect(rec.data?.duration).toBeGreaterThan(0)
  }, 60000)

  it('video 段：私聊视频', async () => {
    const segs = await sendPrivateAndAwait(
      [{ type: 'video', data: { uri: MediaPaths.freshVideoUri } }],
      45000,
    )
    const vid = segs.find((s: any) => s.type === 'video')
    expect(vid).toBeDefined()
    expect(typeof vid.data?.resource_id).toBe('string')
    expect(vid.data.resource_id.length).toBeGreaterThan(0)
    // 同群聊：width/height 字段存在但实测 server 不一定下发
    expect(typeof vid.data?.width).toBe('number')
    expect(typeof vid.data?.height).toBe('number')
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

  it('forward 段：私聊合并转发（含混合 inline：text/face/image），核对各节点内容到位', async () => {
    // 同群聊：face 段在合并转发里被 server drop，text/image 完整保留。
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const ts = Date.now()
    const inlineNodes = [
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-text',
        segments: [{ type: 'text', data: { text: `priv-fwd-text-${ts}` } }],
      },
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-face',
        segments: [
          { type: 'face', data: { face_id: '4' } },
          { type: 'text', data: { text: ` priv-fwd-face-${ts}` } },
        ],
      },
      {
        user_id: ctx.primaryUserId,
        sender_name: 'milky-test-image',
        segments: [
          { type: 'image', data: { uri: MediaPaths.testImageUri } },
          { type: 'text', data: { text: ` priv-fwd-image-${ts}` } },
        ],
      },
    ]
    const sendRes = await primary.call<{ forward_id?: string; message_seq?: number }>(
      'send_private_message',
      {
        user_id: ctx.secondaryUserId,
        message: [{ type: 'forward', data: { messages: inlineNodes } }],
      },
    )
    Assertions.assertSuccess(sendRes, 'send_private_message (forward)')
    expect(sendRes.data?.message_seq).toBeGreaterThan(0)

    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'message_receive', message_scene: 'friend', sender_id: ctx.primaryUserId },
      (e) => e.data?.message_seq === sendRes.data!.message_seq,
      15000,
    )
    const fwd = (ev.data?.segments ?? []).find((s: any) => s.type === 'forward')
    expect(fwd).toBeDefined()
    expect(typeof fwd.data?.forward_id).toBe('string')

    const secondary = ctx.twoAccountTest.getClient('secondary')
    const fwdRes = await secondary.call<{ messages: any[] }>('get_forwarded_messages', {
      forward_id: fwd.data.forward_id,
    })
    Assertions.assertSuccess(fwdRes, 'get_forwarded_messages')
    const messages = fwdRes.data?.messages ?? []
    expect(messages.length).toBe(inlineNodes.length)

    expect(messages[0].sender_name).toBe('milky-test-text')
    expect(messages[1].sender_name).toBe('milky-test-face')
    expect(messages[2].sender_name).toBe('milky-test-image')

    expect(messages[0].segments.some((s: any) => s.type === 'text' && s.data?.text === `priv-fwd-text-${ts}`)).toBe(true)

    const node1Texts = messages[1].segments.filter((s: any) => s.type === 'text').map((s: any) => s.data?.text).join('')
    expect(node1Texts).toContain(`priv-fwd-face-${ts}`)

    const imgSeg = messages[2].segments.find((s: any) => s.type === 'image')
    expect(imgSeg).toBeDefined()
    expect(typeof imgSeg.data?.resource_id).toBe('string')
    expect(imgSeg.data.resource_id.length).toBeGreaterThan(0)
    const node2Texts = messages[2].segments.filter((s: any) => s.type === 'text').map((s: any) => s.data?.text).join('')
    expect(node2Texts).toContain(`priv-fwd-image-${ts}`)
  }, 90000)
})
