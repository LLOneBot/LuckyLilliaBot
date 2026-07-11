import { Context } from 'cordis'
import { Hono } from 'hono'
import { serializeResult } from '../../utils'

/**
 * 列表型查询：好友 / 群组 / 置顶。
 * 全部 GET，没有副作用，直接返 NT API 内部 shape（serializeResult 处理 Map）。
 */
export function createChatsRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 好友列表（带分组）
  router.get('/friends', async (c) => {
    try {
      const result = await ctx.ntFriendApi.getFriends(true)
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('获取好友列表失败:', e)
      return c.json({ success: false, message: '获取好友列表失败', error: (e as Error).message }, 500)
    }
  })

  // 群列表
  router.get('/groups', async (c) => {
    try {
      const groups = await ctx.ntGroupApi.getGroups(false)
      return c.json({ success: true, data: serializeResult(groups) })
    } catch (e) {
      ctx.logger.error('获取群列表失败:', e)
      return c.json({ success: false, message: '获取群列表失败', error: (e as Error).message }, 500)
    }
  })

  // 置顶列表（好友 + 群）
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
