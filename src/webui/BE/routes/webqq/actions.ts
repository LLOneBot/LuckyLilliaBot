import { Context } from 'cordis'
import { Hono } from 'hono'
import { GroupMsgMask } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'

/** 全部 POST + JSON; errCode / result 在这里校验, FE 不用再判断 */
export function createActionsRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.post('/group/kick', async (c) => {
    try {
      const { groupCode, uid, refuseForever } = await c.req.json() as {
        groupCode: string | number
        uid: string
        refuseForever?: boolean
      }
      if (!groupCode || !uid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntGroupApi.kickGroupMember(+groupCode, [uid], refuseForever ?? false, '')
      if (res?.errorCode !== 0) {
        return c.json({ success: false, message: res?.errorMsg || '踢出失败' }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('踢人失败:', e)
      return c.json({ success: false, message: '踢人失败', error: (e as Error).message }, 500)
    }
  })

  // duration 单位秒, 0 = 解禁
  router.post('/group/ban', async (c) => {
    try {
      const { groupCode, uid, duration } = await c.req.json() as {
        groupCode: string | number
        uid: string
        duration: number
      }
      if (!groupCode || !uid || duration === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntGroupApi.muteGroupMember(+groupCode, [{ uid, duration }])
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('禁言失败:', e)
      return c.json({ success: false, message: '禁言失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group/member-role', async (c) => {
    try {
      const { groupCode, uid, isAdmin } = await c.req.json() as {
        groupCode: string | number
        uid: string
        isAdmin: boolean
      }
      if (!groupCode || !uid || isAdmin === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntGroupApi.setGroupMemberAdmin(+groupCode, uid, isAdmin)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('设置管理员失败:', e)
      return c.json({ success: false, message: '设置管理员失败', error: (e as Error).message }, 500)
    }
  })

  // 群主退群就是解散
  router.post('/group/quit', async (c) => {
    try {
      const { groupCode } = await c.req.json() as { groupCode: string | number }
      if (!groupCode) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntGroupApi.quitGroup(+groupCode)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('退群失败:', e)
      return c.json({ success: false, message: '退群失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group/set-top', async (c) => {
    try {
      const { groupCode, isTop } = await c.req.json() as {
        groupCode: string | number
        isTop: boolean
      }
      if (!groupCode || isTop === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntGroupApi.setGroupPin(+groupCode, isTop)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('设置群置顶失败:', e)
      return c.json({ success: false, message: '设置群置顶失败', error: (e as Error).message }, 500)
    }
  })

  // msgMask: 1=接收并提醒, 2=群助手, 3=屏蔽, 4=接收不提醒
  router.post('/group/msg-mask', async (c) => {
    try {
      const { groupCode, msgMask } = await c.req.json() as {
        groupCode: string | number
        msgMask: number
      }
      if (!groupCode || msgMask === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntGroupApi.setGroupMsgMask(+groupCode, msgMask as GroupMsgMask)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('设置群消息接收方式失败:', e)
      return c.json({ success: false, message: '设置群消息接收方式失败', error: (e as Error).message }, 500)
    }
  })

  // 仅群主可用
  router.post('/group/special-title', async (c) => {
    try {
      const { groupCode, uid, title } = await c.req.json() as {
        groupCode: string | number
        uid: string
        title: string
      }
      if (!groupCode || !uid || title === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const result = await ctx.ntGroupApi.setGroupMemberSpecialTitle(+groupCode, uid, title)
      if (result.errorCode !== 0) {
        return c.json({ success: false, message: result.errorMsg }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('设置群头衔失败:', e)
      return c.json({ success: false, message: '设置群头衔失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group/poke', async (c) => {
    try {
      const { groupCode, uin } = await c.req.json() as {
        groupCode: string | number
        uin: string | number
      }
      if (!groupCode || !uin) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const result = await ctx.ntGroupApi.sendGroupNudge(+groupCode, +uin)
      if (result.errorCode !== 0) {
        return c.json({ success: false, message: result.errorMsg }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('群戳一戳失败:', e)
      return c.json({ success: false, message: '群戳一戳失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/friend/delete', async (c) => {
    try {
      const { uid } = await c.req.json() as { uid: string }
      if (!uid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const result = await ctx.ntFriendApi.deleteFriend(uid)
      if (result.errorCode !== 0) {
        return c.json({ success: false, message: result.errorMsg }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('删除好友失败:', e)
      return c.json({ success: false, message: '删除好友失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/friend/set-top', async (c) => {
    try {
      const { uid, isTop } = await c.req.json() as {
        uid: string
        isTop: boolean
      }
      if (!uid || isTop === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntFriendApi.setFriendPin(uid, isTop)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('设置好友置顶失败:', e)
      return c.json({ success: false, message: '设置好友置顶失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/friend/poke', async (c) => {
    try {
      const { uin } = await c.req.json() as { uin: string | number }
      if (!uin) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const result = await ctx.ntFriendApi.sendFriendNudge(+uin, false)
      if (result.errorCode !== 0) {
        return c.json({ success: false, message: result.errorMsg }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('好友戳一戳失败:', e)
      return c.json({ success: false, message: '好友戳一戳失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
