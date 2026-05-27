import { Context } from 'cordis'
import { BuddyReqType, GroupRequestOperateTypes } from '@/ntqqapi/types'
import { Hono } from 'hono'

export function createNotificationRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 获取群通知列表
  router.get('/notifications/group', async (c) => {
    try {
      throw new Error('暂未实现') // TODO: 实现它
    } catch (e) {
      ctx.logger.error('获取群通知失败:', e)
      return c.json({ success: false, message: '获取群通知失败', error: (e as Error).message }, 500)
    }
  })

  // 获取好友申请历史
  router.get('/notifications/friend', async (c) => {
    try {
      const result = await ctx.ntFriendApi.getFriendRequests(50)
      const buddyReqs = result.filter((reqItem) => !reqItem.isInitiator)
      const enriched = await Promise.all(buddyReqs.map(async (reqItem) => {
        const uin = await ctx.ntUserApi.getUinByUid(reqItem.friendUid).catch(() => '')
        const nick = await ctx.ntUserApi.getUserSimpleInfo(reqItem.friendUid).then(e => e.coreInfo.nick).catch(() => '')
        return {
          friendUid: reqItem.friendUid,
          friendUin: uin,
          friendNick: nick,
          reqTime: reqItem.timestamp.toString(),
          extWords: reqItem.comment,
          isDecide: ![BuddyReqType.PeerInitiator, BuddyReqType.MeInitiatorWaitPeerConfirm].includes(reqItem.state),
          reqType: reqItem.state,
          addSource: reqItem.source,
          flag: reqItem.friendUid
        }
      }))
      return c.json({ success: true, data: enriched })
    } catch (e) {
      ctx.logger.error('获取好友申请失败:', e)
      return c.json({ success: false, message: '获取好友申请失败', error: (e as Error).message }, 500)
    }
  })

  // 获取被过滤的好友申请
  router.get('/notifications/friend/doubt', async (c) => {
    try {
      const result = await ctx.ntFriendApi.getDoubtFriendRequests(50)
      const enriched = result.map((item) => ({
        uid: item.sourceUid,
        nick: item.sourceNickname,
        reqTime: item.timestamp.toString(),
        msg: item.comment,
        source: item.source,
        reason: item.warningInfo,
        groupCode: item.groupCode,
        flag: item.sourceUid
      }))
      return c.json({ success: true, data: enriched })
    } catch (e) {
      ctx.logger.error('获取被过滤好友申请失败:', e)
      return c.json({ success: false, message: '获取被过滤好友申请失败', error: (e as Error).message }, 500)
    }
  })

  // 处理被过滤的好友申请（仅支持同意）
  router.post('/notifications/friend/doubt/approve', async (c) => {
    try {
      const { uid } = await c.req.json() as { uid: string }
      if (!uid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntFriendApi.approvalDoubtFriendRequest(uid)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('处理被过滤好友申请失败:', e)
      return c.json({ success: false, message: '处理被过滤好友申请失败', error: (e as Error).message }, 500)
    }
  })

  // 处理群通知（同意/拒绝）
  router.post('/notifications/group/handle', async (c) => {
    try {
      const { flag, action, reason } = await c.req.json() as {
        flag: string
        action: 'approve' | 'reject'
        reason?: string
      }
      if (!flag || !action) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const operateType = action === 'approve'
        ? GroupRequestOperateTypes.Approve
        : GroupRequestOperateTypes.Reject
      await ctx.ntGroupApi.handleGroupRequest(flag, operateType, reason)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('处理群通知失败:', e)
      return c.json({ success: false, message: '处理群通知失败', error: (e as Error).message }, 500)
    }
  })

  // 处理好友申请（同意/拒绝）
  router.post('/notifications/friend/handle', async (c) => {
    try {
      const { flag, action } = await c.req.json() as {
        flag: string
        action: 'approve' | 'reject'
      }
      if (!flag || !action) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntFriendApi.approvalFriendRequest(flag, action === 'approve')
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('处理好友申请失败:', e)
      return c.json({ success: false, message: '处理好友申请失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
