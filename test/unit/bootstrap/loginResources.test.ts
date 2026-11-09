import { Context, Fiber, FiberState, Service } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindLoginResources, type LoginIdentity } from '@/plugin/internal/protocol/nt-protocol/loginResources'

let ctx: Context
let fibers: Fiber[]
class Protocol extends Service {
  selfInfo = { uin: '', uid: '', nick: '', online: false }
  constructor(ctx: Context) { super(ctx, 'qqProtocol') }
}

beforeEach(async () => {
  ctx = new Context()
  fibers = [await ctx.plugin(Protocol)]
})
afterEach(async () => {
  for (const fiber of fibers.reverse()) await fiber.dispose()
})

function bind(mount: (ctx: Context, identity: LoginIdentity) => void) {
  const fiber = ctx.plugin({
    inject: ['qqProtocol'],
    apply(ctx: Context) { bindLoginResources(ctx, mount) },
  }).ctx.fiber
  fibers.push(fiber)
  return fiber
}
async function login(uin = '123456') {
  Object.assign(ctx.get('qqProtocol')!.selfInfo, { uin, uid: `u_${uin}`, nick: uin, online: true })
  await ctx.parallel('qq/online')
}

describe('private NT login resources', () => {
  it('waits for a complete login identity, and keeps one subtree across concurrent online events and reconnects', async () => {
    const mounted = vi.fn()
    const stopped = vi.fn()
    const owner = bind((child, identity) => {
      mounted(identity)
      child.effect(() => stopped)
    })
    await owner.await()
    expect(ctx.get('account')).toBeUndefined()
    expect(mounted).not.toHaveBeenCalled()
    Object.assign(ctx.get('qqProtocol')!.selfInfo, { online: true, uin: '123456' })
    await ctx.parallel('qq/online')
    expect(mounted).not.toHaveBeenCalled()
    await Promise.all([login(), ctx.parallel('qq/online'), ctx.parallel('qq/online')])
    await vi.waitFor(() => expect(mounted).toHaveBeenCalledTimes(1))
    ctx.get('qqProtocol')!.selfInfo.online = false
    await ctx.parallel('protocol/disconnect')
    await login()
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(stopped).not.toHaveBeenCalled()
    await owner.dispose()
    expect(stopped).toHaveBeenCalledTimes(1)
  })

  it('catches an online identity that predates the listener', async () => {
    await login('654321')
    const mounted = vi.fn()
    await bind((_child, identity) => { mounted(identity) }).await()
    await vi.waitFor(() => expect(mounted).toHaveBeenCalledWith({ uin: '654321', uid: 'u_654321' }))
  })

  it('retries the same identity after a resource mount fails', async () => {
    const mount = vi.fn()
      .mockImplementationOnce(() => { throw new Error('temporary resource initialization failure') })
      .mockImplementation(() => {})
    await bind(mount).await()
    await login()
    expect(mount).toHaveBeenCalledTimes(1)
    await login()
    expect(mount).toHaveBeenCalledTimes(2)
    await login()
    expect(mount).toHaveBeenCalledTimes(2)
  })

  it('closes the previous identity before mounting the latest login, even during concurrent changes', async () => {
    const closing = Promise.withResolvers<void>()
    const history: string[] = []
    await bind((child, identity) => {
      history.push(`up:${identity.uin}`)
      child.effect(() => async () => {
        history.push(`down:${identity.uin}`)
        if (identity.uin === '1') await closing.promise
      })
    }).await()
    await login('1')
    await vi.waitFor(() => expect(history).toEqual(['up:1']))
    const second = login('2')
    await vi.waitFor(() => expect(history).toEqual(['up:1', 'down:1']))
    const third = login('3')
    closing.resolve()
    await Promise.all([second, third])
    await vi.waitFor(() => expect(history).toEqual(['up:1', 'down:1', 'up:3']))
  })

  it('recreates resources after explicit logout, including immediate login to the same account', async () => {
    const mounted = vi.fn()
    const stopped = vi.fn()
    await bind(child => { mounted(); child.effect(() => stopped) }).await()
    await login()
    await vi.waitFor(() => expect(mounted).toHaveBeenCalledTimes(1))
    await Promise.all([ctx.parallel('qq/logout'), login()])
    await vi.waitFor(() => expect(mounted).toHaveBeenCalledTimes(2))
    expect(stopped).toHaveBeenCalledTimes(1)
    await ctx.parallel('qq/logout')
    expect(stopped).toHaveBeenCalledTimes(2)
  })

  it('disposes a child still initializing and never remounts after its owner is stopped', async () => {
    const initializing = Promise.withResolvers<void>()
    const started = vi.fn()
    const stopped = vi.fn()
    class SlowResource extends Service {
      constructor(ctx: Context) { super(ctx, 'nt-test-resource') }
      async [Service.init]() {
        started()
        await initializing.promise
        return stopped
      }
    }
    const owner = bind(child => { child.plugin(SlowResource) })
    await owner.await()
    await login()
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
    const stopping = owner.dispose()
    const lateLogin = login('2')
    initializing.resolve()
    await Promise.all([stopping, lateLogin])
    expect(stopped).toHaveBeenCalledOnce()
    expect(started).toHaveBeenCalledOnce()
    expect(ctx.get('nt-test-resource')).toBeUndefined()
    expect(owner.state).toBe(FiberState.DISPOSED)
  })
})
