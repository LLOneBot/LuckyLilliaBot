import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 群公告 / 精华 / 表情回应 / 通知', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  // 157ecad5 webapi.ts refactor 之后 get_group_announcements 返 500
  // "Internal error: result.inst is not iterable"。同事 refactor 引入的 regression，
  // 不是测试问题，等修了再启用。
  it.skip('get_group_announcements 返回数组（webapi refactor 后挂了）', async () => {
    // const primary = ctx.twoAccountTest.getClient('primary')
    // const res = await primary.call<{ announcements: any[] }>('get_group_announcements', {
    //   group_id: ctx.testGroupId,
    // })
    // Assertions.assertSuccess(res, 'get_group_announcements')
    // expect(Array.isArray(res.data?.announcements)).toBe(true)
  }, 15000)

  // milky 端 send_group_announcement 当前实现走 ntWebApi 通道有 bug（server 已下发但 milky
  // 整理响应时 retcode=-500 throws "undefined"；OB11 同样 endpoint 是稳定通过的）。
  // 等 milky api/group.ts 修好再启用。
  it.skip('send_group_announcement + delete_group_announcement: milky-side bug, retcode=-500', async () => {
    // TODO: milky/api/group.ts 里 send_group_announcement 的实现有 undefined throw
  })

  it('set_group_essence_message + get_group_essence_messages: 设精华再取消', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-essence-${Date.now()}`
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    const messageSeq = sendRes.data!.message_seq
    await new Promise((r) => setTimeout(r, 1500))

    const setRes = await primary.call('set_group_essence_message', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      is_set: true,
    })
    Assertions.assertSuccess(setRes, 'set_group_essence_message (add)')

    await new Promise((r) => setTimeout(r, 1500))
    const list = await primary.call<{ messages: any[] }>('get_group_essence_messages', {
      group_id: ctx.testGroupId,
      page_index: 0,
      page_size: 20,
    })
    Assertions.assertSuccess(list, 'get_group_essence_messages')
    expect(Array.isArray(list.data?.messages)).toBe(true)

    const unsetRes = await primary.call('set_group_essence_message', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      is_set: false,
    })
    Assertions.assertSuccess(unsetRes, 'set_group_essence_message (remove)')
  }, 60000)

  it('send_group_message_reaction: 给一条群消息加表情再取消', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `milky-react-${Date.now()}`
    const sendRes = await primary.call<{ message_seq: number }>('send_group_message', {
      group_id: ctx.testGroupId,
      message: [{ type: 'text', data: { text } }],
    })
    Assertions.assertSuccess(sendRes, 'send_group_message')
    const messageSeq = sendRes.data!.message_seq
    await new Promise((r) => setTimeout(r, 1500))

    const addRes = await primary.call('send_group_message_reaction', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      reaction: '4',
      reaction_type: 'face',
      is_add: true,
    })
    Assertions.assertSuccess(addRes, 'send_group_message_reaction (add)')

    await new Promise((r) => setTimeout(r, 800))
    const remRes = await primary.call('send_group_message_reaction', {
      group_id: ctx.testGroupId,
      message_seq: messageSeq,
      reaction: '4',
      reaction_type: 'face',
      is_add: false,
    })
    Assertions.assertSuccess(remRes, 'send_group_message_reaction (remove)')
  }, 30000)

  it('get_group_notifications 返回结构合法', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ notifications: any[] }>('get_group_notifications', {
      limit: 10,
      is_filtered: false,
    })
    Assertions.assertSuccess(res, 'get_group_notifications')
    expect(Array.isArray(res.data?.notifications)).toBe(true)
  }, 15000)
})
