import { setupSatoriTest, teardownSatoriTest, SatoriTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'

describe('Satori 群 / 频道 / 成员（read-only）', () => {
  let ctx: SatoriTestContext

  beforeAll(async () => {
    ctx = await setupSatoriTest()
  })

  afterAll(() => {
    teardownSatoriTest(ctx)
  })

  it('guild.get 返回测试群信息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ id: string; name: string }>('guild.get', { guild_id: ctx.testGroupId })
    Assertions.assertSuccess(res, 'guild.get')
    expect(res.data?.id).toBe(ctx.testGroupId)
    expect(typeof res.data?.name).toBe('string')
  }, 15000)

  it('channel.get 用 channel_id == guild_id 返回测试群', async () => {
    // satori 协议下群即频道，channel_id 跟 guild_id 是同一个
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ id: string; type: number; name: string }>('channel.get', { channel_id: ctx.testGroupId })
    Assertions.assertSuccess(res, 'channel.get')
    expect(res.data?.id).toBe(ctx.testGroupId)
    expect(res.data?.type).toBe(0) // Channel.Type.TEXT
  }, 15000)

  it('channel.list 拉测试群下的频道列表', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ data: Array<{ id: string }> }>('channel.list', { guild_id: ctx.testGroupId })
    Assertions.assertSuccess(res, 'channel.list')
    expect(Array.isArray(res.data?.data)).toBe(true)
    expect(res.data?.data?.length).toBeGreaterThan(0)
  }, 15000)

  it('guild.member.get 返回 secondary 的群成员信息', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ user: { id: string }; nick: string }>('guild.member.get', {
      guild_id: ctx.testGroupId,
      user_id: ctx.secondaryUserId,
    })
    Assertions.assertSuccess(res, 'guild.member.get')
    expect(res.data?.user?.id).toBe(ctx.secondaryUserId)
  }, 15000)

  it('guild.member.list 返回测试群所有成员', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ data: Array<{ user: { id: string } }> }>('guild.member.list', { guild_id: ctx.testGroupId })
    Assertions.assertSuccess(res, 'guild.member.list')
    const members = res.data?.data ?? []
    expect(members.length).toBeGreaterThan(1)
    const ids = members.map(m => m.user?.id)
    expect(ids).toContain(ctx.primaryUserId)
    expect(ids).toContain(ctx.secondaryUserId)
  }, 15000)

  it('guild.role.list 返回固定的三个角色 (owner/admin/member)', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ data: Array<{ id: string; name: string }> }>('guild.role.list', { guild_id: ctx.testGroupId })
    Assertions.assertSuccess(res, 'guild.role.list')
    const names = (res.data?.data ?? []).map(r => r.name)
    expect(names).toContain('owner')
    expect(names).toContain('admin')
    expect(names).toContain('member')
  }, 15000)

  it('user.channel.create 返回 private:<uid> 的 direct channel', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const res = await primary.call<{ id: string; type: number }>('user.channel.create', { user_id: ctx.secondaryUserId })
    Assertions.assertSuccess(res, 'user.channel.create')
    expect(res.data?.id).toBe(`private:${ctx.secondaryUserId}`)
    expect(res.data?.type).toBe(1) // Channel.Type.DIRECT
  }, 15000)
})
