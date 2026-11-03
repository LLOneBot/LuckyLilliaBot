import { Context } from 'cordis'
import { Hono } from 'hono'
import { getProtocol, isNativeQQMode } from '@/common/utils/environment'

/**
 * The scanned account's figures for the plugin's Dashboard cards: always the mode, the rest once logged in, the
 * QQ process only where the protocol can read it (NativeQQ).
 */
export function createNTStatsRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/ntqq/stats', async (c) => {
    try {
      const app = ctx.get('app')
      const protocol = ctx.get('qqProtocol')
      let account: { friendCount: number; groupCount: number; messageReceived: number; messageSent: number; lastMessageTime: number } | undefined
      if (app) {
        const friends = await ctx.get('ntFriendApi')!.getFriends(false)
        const groups = await ctx.get('ntGroupApi')!.getGroups(false)
        account = {
          friendCount: friends.friends.length,
          groupCount: groups.length,
          messageReceived: app.messageReceivedCount,
          messageSent: app.messageSentCount,
          lastMessageTime: app.lastMessageTime,
        }
      }
      const qq = await protocol?.getQQResourceUsage()
      const device = await ctx.get('ntSystemApi')?.getDeviceInfo().catch(() => undefined)
      const mode = isNativeQQMode() ? 'nativeqq' : 'direct'
      return c.json({
        success: true,
        data: {
          online: ctx.qqProtocol.selfInfo.online,
          uin: ctx.qqProtocol.selfInfo.uin,
          nick: ctx.qqProtocol.selfInfo.nick,
          ...account,
          mode,
          // --protocol 只对直连有意义
          protocol: mode === 'direct' ? getProtocol() : undefined,
          version: qq?.version ?? device?.buildVer,
          qq: qq ?? undefined,
        },
      })
    } catch (e) {
      return c.json({ success: false, message: '获取统计数据失败', error: e }, 500)
    }
  })

  return router
}

export const NTStatsRoutes = {
  name: 'webui-nt-stats-routes',
  inject: ['webuiServer', 'qqProtocol'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/ntqq', new Hono().route('/api', createNTStatsRoutes(ctx)))
  },
}
