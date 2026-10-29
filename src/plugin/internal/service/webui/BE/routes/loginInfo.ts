import { Context } from 'cordis'
import { Hono } from 'hono'
import { selfInfo } from '@/common/globalVars'
import { currentPmhqTarget, getProtocol, isPmhqMode, launchPins, lockedProtocol } from '@/common/utils/environment'

/** Part of the WebUI shell: the NTQQ protocol page polls it whether or not the protocol runs. */
export function createLoginInfoRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/login-info', (c) => {
    const protocol = ctx.get('qqProtocol')
    const pmhq = isPmhqMode()
    return c.json({
      success: true,
      data: {
        ...selfInfo,
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
