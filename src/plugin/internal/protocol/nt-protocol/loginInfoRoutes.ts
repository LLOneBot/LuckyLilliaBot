import { Context } from 'cordis'
import { Hono } from 'hono'
import { currentNativeQQTarget, getProtocol, isNativeQQMode, launchPins, lockedProtocol } from '@/common/utils/environment'
import { detectQQPath } from './qqPath'

/** The account and the login method as the NTQQ page shows them, and whether the protocol runs. */
export function createLoginInfoRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/login-info', async (c) => {
    const protocol = ctx.get('qqProtocol')
    const nativeQQ = isNativeQQMode()
    // The protocol's own record of the account: with the protocol off there is none
    const account = protocol?.selfInfo ?? { uid: '', uin: '', nick: '', online: false }
    // The bridge's state is NativeQQ's: its session, QQ's process, the account
    const status = nativeQQ ? await protocol?.bridgeStatus?.().catch(() => undefined) : undefined
    return c.json({
      success: true,
      data: {
        ...account,
        mode: nativeQQ ? 'nativeqq' : 'direct',
        ntProtocol: !!protocol,
        protocol: getProtocol(),
        // Set once the pure protocol has a client: a protocol saved after that applies on the next start
        lockedProtocol: lockedProtocol(),
        pins: launchPins(),
        ...nativeQQ && { nativeQQ: { ...currentNativeQQTarget(), connected: !!protocol?.get_is_connected(), ...status && { status } } },
      },
    })
  })

  return router
}

/** The QQ the bridge starts when no path is set, for the login method form; platform says what QQ's file is called */
export function createQQPathRoutes(): Hono {
  const router = new Hono()
  router.get('/nativeqq/qq-path', async (c) => {
    return c.json({ success: true, data: { detected: await detectQQPath() ?? null, platform: process.platform } })
  })
  return router
}

/** The standby part of builtin:nt-protocol: the NTQQ page reads it with the protocol switched off too. */
export const LoginInfoRoutes = {
  name: 'webui-nt-login-info-routes',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/login-info', new Hono().route('/api', createLoginInfoRoutes(ctx)))
    ctx.webuiServer.route('/api/nativeqq/qq-path', new Hono().route('/api', createQQPathRoutes()))
  },
}
