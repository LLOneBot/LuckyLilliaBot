import { Context, FiberState } from 'cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import { selfInfo } from '@/common/globalVars'
import AccountService from '@/plugin/internal/protocol/nt-protocol/account'

let ctx: Context

beforeEach(() => {
  ctx = new Context()
  Object.assign(selfInfo, { uin: '', uid: '', nick: '', online: false })
})

function login() {
  Object.assign(selfInfo, { uin: '123456', uid: 'u_123456', nick: 'TestBot', online: true })
  ctx.emit('qq/online')
}

describe('AccountService', () => {
  it('holds dependents back until the first qq/online and starts them once', async () => {
    const started: string[] = []
    await ctx.plugin(AccountService)
    const dependent = ctx.plugin({
      inject: ['account'],
      apply: (ctx: Context) => {
        started.push(ctx.account.uin)
      },
    }).ctx.fiber
    await dependent.await()
    expect(dependent.state).toBe(FiberState.PENDING)
    expect(started).toEqual([])

    login()
    await expect.poll(() => dependent.state).toBe(FiberState.ACTIVE)
    expect(started).toEqual(['123456'])

    // a reconnect announces qq/online again; nothing restarts
    ctx.emit('qq/online')
    await dependent.await()
    expect(started).toEqual(['123456'])
  })

  it('catches up with a login that happened before it came up', async () => {
    Object.assign(selfInfo, { uin: '654321', uid: 'u_654321', nick: 'Early', online: true })
    await ctx.plugin(AccountService)
    const fiber = await ctx.plugin({ inject: ['account'], apply: () => {} })
    await expect.poll(() => fiber.state).toBe(FiberState.ACTIVE)
    expect(ctx.account).toMatchObject({ uin: '654321', nick: 'Early' })
  })
})
