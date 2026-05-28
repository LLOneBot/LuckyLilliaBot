import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Milky 群操作', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  it('get_group_list 包含测试群', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ groups: Array<{ group_id: number; group_name: string }> }>(
      'get_group_list',
      {},
    )
    Assertions.assertSuccess(res, 'get_group_list')
    const found = res.data?.groups?.find((g) => g.group_id === ctx.testGroupId)
    expect(found).toBeDefined()
  })

  it('get_group_info 返回群信息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ group: { group_id: number; group_name: string } }>('get_group_info', {
      group_id: ctx.testGroupId,
    })
    Assertions.assertSuccess(res, 'get_group_info')
    expect(res.data?.group?.group_id).toBe(ctx.testGroupId)
  })

  it('get_group_member_info 返回 secondary 在群里的成员信息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ member: { user_id: number } }>('get_group_member_info', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'get_group_member_info')
    expect(res.data?.member?.user_id).toBe(ctx.secondaryUserId)
  })

  it('set_group_member_card: primary 改 secondary 的群名片', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const newCard = `milky-card-${Date.now()}`
    const res = await primary.call('set_group_member_card', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      card: newCard,
    })
    Assertions.assertSuccess(res, 'set_group_member_card')
    // 不强制等事件，因为 milky 不一定下发 group_card 类事件；
    // 后续通过 get_group_member_info 拉一次确认改成功
    await new Promise((r) => setTimeout(r, 1500))
    const info = await primary.call<{ member: { card: string } }>('get_group_member_info', {
      group_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
      no_cache: true,
    })
    Assertions.assertSuccess(info, 'get_group_member_info')
    expect(info.data?.member?.card).toBe(newCard)
  }, 30000)

  it('set_group_name: primary 改群名（恢复）', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const original = await primary.call<{ group: { group_name: string } }>('get_group_info', {
      group_id: ctx.testGroupId,
    })
    Assertions.assertSuccess(original, 'get_group_info')
    const originalName = original.data!.group.group_name
    const newName = `MilkyTest_${Date.now()}`

    const setRes = await primary.call('set_group_name', {
      group_id: ctx.testGroupId,
      new_group_name: newName,
    })
    Assertions.assertSuccess(setRes, 'set_group_name')

    await new Promise((r) => setTimeout(r, 1500))
    const after = await primary.call<{ group: { group_name: string } }>('get_group_info', {
      group_id: ctx.testGroupId,
      no_cache: true,
    })
    expect(after.data?.group?.group_name).toBe(newName)

    // 恢复
    await primary.call('set_group_name', { group_id: ctx.testGroupId, new_group_name: originalName })
  }, 30000)
})
