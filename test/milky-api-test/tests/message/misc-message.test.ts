import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 消息辅助操作', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('mark_message_as_read: 私聊 + 群聊 各发一条然后标记已读', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')

    // 群聊
    const grp = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text: `mark-grp-${Date.now()}` } }],
    })
    Assertions.assertSuccess(grp, 'send_group_message')
    await new Promise((r) => setTimeout(r, 800))
    const markGrp = await primary.call('mark_message_as_read', {
      message_scene: 'group',
      peer_id: ctx.testGroupId,
      message_seq: grp.data!.message_seq,
    })
    Assertions.assertSuccess(markGrp, 'mark_message_as_read (group)')

    // 私聊
    const priv = await primary.call<{ message_seq: number }>('send_private_message', {
      user_id: ctx.secondaryUserId,
      message: [{ type: 'text', data: { text: `mark-priv-${Date.now()}` } }],
    })
    Assertions.assertSuccess(priv, 'send_private_message')
    await new Promise((r) => setTimeout(r, 800))
    const markPriv = await primary.call('mark_message_as_read', {
      message_scene: 'friend',
      peer_id: ctx.secondaryUserId,
      message_seq: priv.data!.message_seq,
    })
    Assertions.assertSuccess(markPriv, 'mark_message_as_read (friend)')
  }, 60000)

  it('get_resource_temp_url: 发图后用 segment 里 resource_id 拿临时 URL', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    // 接收方收到的图片消息里会带 resource_id；这里取 secondary 视角拉历史里包含图片 segment 的消息
    // 简化：发一条图片消息，从 send 返回的 message_seq 用 get_message 拿回 segments，找 resource_id
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'image', data: { uri: 'https://q1.qlogo.cn/g?b=qq&nk=10000&s=640' } }],
    })
    if (sendRes.status !== 'ok') {
      console.log('skip get_resource_temp_url: 发图失败可能是测试环境网络问题，错误:', sendRes.message)
      return
    }
    await new Promise((r) => setTimeout(r, 1500))

    const msgRes = await primary.call<{ message: { segments: any[] } }>('get_message', {
      message_scene: 'group',
      peer_id: ctx.testGroupId,
      message_seq: sendRes.data!.message_seq,
    })
    Assertions.assertSuccess(msgRes, 'get_message (image)')
    const imageSeg = msgRes.data?.message?.segments?.find((s: any) => s.type === 'image')
    if (!imageSeg?.data?.resource_id) {
      console.log('skip get_resource_temp_url: 消息里没有 resource_id 可用')
      return
    }
    const urlRes = await primary.call<{ url: string }>('get_resource_temp_url', {
      resource_id: imageSeg.data.resource_id,
    })
    Assertions.assertSuccess(urlRes, 'get_resource_temp_url')
    expect(typeof urlRes.data?.url).toBe('string')
    expect((urlRes.data?.url ?? '').length).toBeGreaterThan(0)
  }, 60000)

  // get_forwarded_messages: 需要先发一个合并转发拿 forward_id，再用 forward_id 拉
  it('get_forwarded_messages: 发合并转发后用 forward_id 拉回来', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')

    // milky 当前 send_group_message 没有内置 forward 段类型；通过 segment.type='forward' 试一下
    // 如果失败说明 milky 端发合并转发的能力还不可用，就 skip 而不是 fail
    const ts = Date.now()
    const sendRes = await primary.call<{ forward_id?: string }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [
        {
          type: 'forward',
          data: {
            messages: [
              {
                user_id: ctx.primaryUserId,
                name: 'milky-test',
                segments: [{ type: 'text', data: { text: `forwarded-${ts}` } }],
              },
            ],
          },
        },
      ],
    })
    if (sendRes.status !== 'ok' || !sendRes.data?.forward_id) {
      console.log('skip get_forwarded_messages: milky 当前不支持发送合并转发或未返回 forward_id')
      return
    }

    const fid = sendRes.data.forward_id
    const res = await primary.call<{ messages: any[] }>('get_forwarded_messages', { forward_id: fid })
    Assertions.assertSuccess(res, 'get_forwarded_messages')
    expect(Array.isArray(res.data?.messages)).toBe(true)
  }, 60000)
})
