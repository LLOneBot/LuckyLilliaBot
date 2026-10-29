import { Context } from 'cordis'
import { Hono } from 'hono'
import { serializeResult } from '../../service/webui/BE/utils'

/** 直接返回 NT API 的原始结构, Map 由 serializeResult 处理 */
export function createChatsRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/friends', async (c) => {
    try {
      const result = await ctx.ntFriendApi.getFriends(true)
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('获取好友列表失败:', e)
      return c.json({ success: false, message: '获取好友列表失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/groups', async (c) => {
    try {
      const groups = await ctx.ntGroupApi.getGroups(false)
      return c.json({ success: true, data: serializeResult(groups) })
    } catch (e) {
      ctx.logger.error('获取群列表失败:', e)
      return c.json({ success: false, message: '获取群列表失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/pins', async (c) => {
    try {
      const pins = await ctx.ntMsgApi.getPins()
      return c.json({ success: true, data: serializeResult(pins) })
    } catch (e) {
      ctx.logger.error('获取置顶列表失败:', e)
      return c.json({ success: false, message: '获取置顶列表失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
