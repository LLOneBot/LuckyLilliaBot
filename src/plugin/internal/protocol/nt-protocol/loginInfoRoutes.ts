import { Context } from 'cordis'
import { Hono } from 'hono'
import { currentPmhqTarget, getProtocol, isPmhqMode, launchPins, lockedProtocol } from '@/common/utils/environment'

/** The account and the login method as the NTQQ page shows them, and whether the protocol runs. */
export function createLoginInfoRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/login-info', (c) => {
    const protocol = ctx.get('qqProtocol')
    const pmhq = isPmhqMode()
    // The protocol's own record of the account: with the protocol off there is none
    const account = protocol?.selfInfo ?? { uid: '', uin: '', nick: '', online: false }
    return c.json({
      success: true,
      data: {
        ...account,
        mode: pmhq ? 'pmhq' : 'direct',
        ntProtocol: !!protocol,
        protocol: getProtocol(),
        // Set once the pure protocol has a client: a protocol saved after that applies on the next start
        lockedProtocol: lockedProtocol(),
        pins: launchPins(),
        ...pmhq && { pmhq: { ...currentPmhqTarget(), connected: !!protocol?.get_is_connected() } },
      },
    })
  })

  return router
}

/** The standby part of builtin:nt-protocol: the NTQQ page reads it with the protocol switched off too. */
export const LoginInfoRoutes = {
  name: 'webui-nt-login-info-routes',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/login-info', new Hono().route('/api', createLoginInfoRoutes(ctx)))
  },
}
