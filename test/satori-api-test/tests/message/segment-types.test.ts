/**
 * Satori 消息元素覆盖测试。
 *
 * Satori 协议 outgoing element（XML 表达）：
 *   text 直接文字, <at id="<uin>"/>, <at type="all"/>, <face id="<index>"/>,
 *   <img src="..."/>, <audio src="..."/>, <video src="..."/>, <quote id="<msgId>"/>,
 *   <message forward> 合并转发 (out of scope: forward 单独测过 / 私聊不能 mention_all)。
 *
 * 这里覆盖：发各种元素 → 等 secondary 收到 message-created 事件 →
 * 从事件 `message.content` (XML 字符串) 解析出对应的元素是否在里面。
 *
 * 媒体文件用 onebot11-api-test 共享 fixture（test/onebot11-api-test/tests/media/）。
 */
import { setupSatoriTest, teardownSatoriTest, SatoriTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'
import { MediaPaths } from '../media'

describe('Satori 消息元素：多种 element 类型覆盖', () => {
  let ctx: SatoriTestContext

  beforeAll(async () => {
    ctx = await setupSatoriTest()
  })

  afterAll(() => {
    teardownSatoriTest(ctx)
  })

  /** primary 发群消息（content 是 satori XML 串）→ 等 secondary 收到 message-created → 返回 message.content */
  async function sendGroupAndAwait(content: string, customMatch: (text: string) => boolean, timeoutMs = 30000): Promise<string> {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content,
    })
    Assertions.assertSuccess(sendRes, 'message.create (group)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        typeof e.message?.content === 'string' &&
        customMatch(e.message.content),
      timeoutMs,
    )
    return ev.message?.content ?? ''
  }

  // ---------- 群聊 ----------

  it('text 元素：纯文本', async () => {
    const tag = `seg-text-${Date.now()}`
    const got = await sendGroupAndAwait(tag, c => c.includes(tag))
    expect(got).toContain(tag)
  }, 30000)

  it('at 元素：@ secondary（按 user id）', async () => {
    const tag = `seg-at-${Date.now()}`
    const content = `<at id="${ctx.secondaryUserId}"/> ${tag}`
    const got = await sendGroupAndAwait(content, c => c.includes(tag) && /<at[^>]+id="\d+"/.test(c))
    expect(got).toMatch(new RegExp(`<at[^>]+id="${ctx.secondaryUserId}"`))
    expect(got).toContain(tag)
  }, 30000)

  it('at 元素：@全体成员', async () => {
    // server 对 @全体成员每天每群有次数上限（实测错信 "code=121"），反复跑会撞顶。
    const tag = `seg-atall-${Date.now()}`
    const primary = ctx.twoAccountTest.getClient('primary')
    ctx.twoAccountTest.clearAllQueues()
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: `<at type="all"/> ${tag}`,
    })
    if (!sendRes.ok && /121/.test(sendRes.message ?? '')) {
      console.log('skip: server hit daily @everyone cap')
      return
    }
    Assertions.assertSuccess(sendRes, 'message.create (at all)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        typeof e.message?.content === 'string' &&
        e.message.content.includes(tag),
      15000,
    )
    expect(ev.message?.content).toMatch(/<at[^>]+type="all"/)
  }, 30000)

  it('face 元素：QQ 表情', async () => {
    const tag = `seg-face-${Date.now()}`
    // face id=4 是 "得意"
    const content = `<face id="4"/>${tag}`
    const got = await sendGroupAndAwait(content, c => c.includes(tag) && /<face[^>]+id="4"/.test(c))
    expect(got).toMatch(/<face[^>]+id="4"/)
  }, 30000)

  it('img 元素：发图', async () => {
    const tag = `seg-img-${Date.now()}`
    const content = `<img src="${MediaPaths.testImageUri}"/>${tag}`
    const got = await sendGroupAndAwait(content, c => c.includes(tag) && /<img[\s\S]*?src=/.test(c))
    expect(got).toMatch(/<img[\s\S]*?src=/)
  }, 60000)

  it('audio 元素：发语音', async () => {
    // audio 单独 send（满足 satori 流程：audio 会先 flush，再单独成段）
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: `<audio src="${MediaPaths.testAudioUri}"/>`,
    })
    Assertions.assertSuccess(sendRes, 'message.create (audio)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        typeof e.message?.content === 'string' &&
        /<audio[\s\S]*?src=/.test(e.message.content),
      30000,
    )
    expect(ev.message?.content).toMatch(/<audio[\s\S]*?src=/)
  }, 60000)

  it('video 元素：发视频', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: `<video src="${MediaPaths.testMp4Uri}"/>`,
    })
    Assertions.assertSuccess(sendRes, 'message.create (video)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        typeof e.message?.content === 'string' &&
        /<video[\s\S]*?src=/.test(e.message.content),
      60000,
    )
    expect(ev.message?.content).toMatch(/<video[\s\S]*?src=/)
  }, 90000)

  it('quote 元素：回复一条群消息', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const baseTag = `seg-quote-base-${Date.now()}`
    // 先发一条原消息，让 satori 端 store 缓存它
    const baseRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: baseTag,
    })
    Assertions.assertSuccess(baseRes, 'message.create (quote base)')
    const baseId = baseRes.data![0].id
    // 等 secondary 端先收到原消息（保证 server 端入库 + secondary 端 store 也有）
    await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) => e.message?.content?.includes(baseTag),
      15000,
    )
    await new Promise(r => setTimeout(r, 500))
    ctx.twoAccountTest.clearAllQueues()

    const replyTag = `seg-quote-reply-${Date.now()}`
    const replyContent = `<quote id="${baseId}"/>${replyTag}`
    const replyRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: ctx.testGroupId,
      content: replyContent,
    })
    Assertions.assertSuccess(replyRes, 'message.create (quote)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.channel?.id) === ctx.testGroupId &&
        typeof e.message?.content === 'string' &&
        e.message.content.includes(replyTag),
      30000,
    )
    expect(ev.message?.content).toMatch(/<quote[\s\S]*?id=/)
    expect(ev.message?.content).toContain(replyTag)
  }, 60000)

  it('混合元素：text + at + face 一起发', async () => {
    const tag = `seg-mix-${Date.now()}`
    const content = `<at id="${ctx.secondaryUserId}"/><face id="4"/> ${tag}`
    const got = await sendGroupAndAwait(content, c =>
      c.includes(tag) &&
      /<at[^>]+id="\d+"/.test(c) &&
      /<face[^>]+id="4"/.test(c)
    )
    expect(got).toMatch(new RegExp(`<at[^>]+id="${ctx.secondaryUserId}"`))
    expect(got).toMatch(/<face[^>]+id="4"/)
    expect(got).toContain(tag)
  }, 30000)

  // ---------- 私聊 ----------

  it('私聊 text 元素：纯文本', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const tag = `seg-priv-text-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: `private:${ctx.secondaryUserId}`,
      content: tag,
    })
    Assertions.assertSuccess(sendRes, 'message.create (private text)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.user?.id) === ctx.primaryUserId &&
        typeof e.message?.content === 'string' &&
        e.message.content.includes(tag),
      15000,
    )
    expect(ev.message?.content).toContain(tag)
  }, 30000)

  it('私聊 img 元素：发图', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const tag = `seg-priv-img-${Date.now()}`
    const content = `<img src="${MediaPaths.testImageUri}"/>${tag}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: `private:${ctx.secondaryUserId}`,
      content,
    })
    Assertions.assertSuccess(sendRes, 'message.create (private img)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.user?.id) === ctx.primaryUserId &&
        typeof e.message?.content === 'string' &&
        /<img[\s\S]*?src=/.test(e.message.content) &&
        e.message.content.includes(tag),
      30000,
    )
    expect(ev.message?.content).toMatch(/<img[\s\S]*?src=/)
  }, 60000)

  it('私聊 face 元素：QQ 表情', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const tag = `seg-priv-face-${Date.now()}`
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: `private:${ctx.secondaryUserId}`,
      content: `<face id="4"/>${tag}`,
    })
    Assertions.assertSuccess(sendRes, 'message.create (private face)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.user?.id) === ctx.primaryUserId &&
        typeof e.message?.content === 'string' &&
        e.message.content.includes(tag) &&
        /<face[^>]+id="4"/.test(e.message.content),
      15000,
    )
    expect(ev.message?.content).toMatch(/<face[^>]+id="4"/)
  }, 30000)

  it('私聊 audio 元素：发语音', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: `private:${ctx.secondaryUserId}`,
      content: `<audio src="${MediaPaths.testAudioUri}"/>`,
    })
    Assertions.assertSuccess(sendRes, 'message.create (private audio)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.user?.id) === ctx.primaryUserId &&
        typeof e.message?.content === 'string' &&
        /<audio[\s\S]*?src=/.test(e.message.content),
      30000,
    )
    expect(ev.message?.content).toMatch(/<audio[\s\S]*?src=/)
  }, 60000)

  it('私聊 video 元素：发视频', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const sendRes = await primary.call<Array<{ id: string }>>('message.create', {
      channel_id: `private:${ctx.secondaryUserId}`,
      content: `<video src="${MediaPaths.testMp4Uri}"/>`,
    })
    Assertions.assertSuccess(sendRes, 'message.create (private video)')
    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { type: 'message-created' },
      (e: any) =>
        String(e.user?.id) === ctx.primaryUserId &&
        typeof e.message?.content === 'string' &&
        /<video[\s\S]*?src=/.test(e.message.content),
      60000,
    )
    expect(ev.message?.content).toMatch(/<video[\s\S]*?src=/)
  }, 90000)
})
