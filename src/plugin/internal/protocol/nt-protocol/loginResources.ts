import { Context, type Fiber } from 'cordis'

/** Private to the NT protocol: database ownership is fixed for one login identity. */
export interface LoginIdentity {
  uin: string
  uid: string
}

/** Keep the login's resource subtree across disconnects, and replace it after logout or a different login. */
export function bindLoginResources(ctx: Context, mount: (ctx: Context, identity: LoginIdentity) => void) {
  const protocol = ctx.qqProtocol
  let desired: LoginIdentity | undefined
  let current: { identity: LoginIdentity; generation: number; fiber: Fiber } | undefined
  let generation = 0
  let pending = Promise.resolve()
  let disposed = false
  const same = (a?: LoginIdentity, b?: LoginIdentity) => a?.uin === b?.uin && a?.uid === b?.uid

  const reconcile = () => {
    pending = pending.then(async () => {
      if (disposed || (same(current?.identity, desired) && (!current || current.generation === generation))) return
      const previous = current
      await previous?.fiber.dispose()
      current = undefined
      // A new online/logout event or disposal may have arrived while the old database was closing.
      if (disposed || !desired) return
      const identity = desired
      const mountingGeneration = generation
      const fiber = ctx.plugin({
        name: 'nt-login-resources',
        apply(child: Context) {
          if (!disposed && mountingGeneration === generation && same(identity, desired)) mount(child, identity)
        },
      }).ctx.fiber
      current = { identity, generation: mountingGeneration, fiber }
      try {
        await fiber.await()
      } catch (error) {
        // A failed mount must not make this identity look initialized on the next online event.
        current = undefined
        await fiber.dispose()
        throw error
      }
    }).catch(error => ctx.logger('nt-protocol').error('登录资源初始化或清理失败', error))
    return pending
  }

  const online = () => {
    const { online, uin, uid } = protocol.selfInfo
    if (!online || !uin || !uid) return
    desired = { uin, uid }
    return reconcile()
  }
  ctx.on('qq/online', online)
  ctx.on('qq/logout', () => {
    generation++
    desired = undefined
    return reconcile()
  })
  ctx.effect(() => async () => {
    disposed = true
    desired = undefined
    await pending
    const previous = current
    current = undefined
    await previous?.fiber.dispose()
  })
  // Protocol startup may have finished logging in before this dependency became available.
  void online()
}
