import { Context } from 'cordis'
import { GroupRequestOperateTypes } from '@/ntqqapi/types'
import { Hono } from 'hono'

export function createNotificationRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 获取群通知列表
  router.get('/notifications/group', async (c) => {
    try {
      const { notifies, normalCount } = await ctx.ntGroupApi.getGroupRequest()
      const enriched = await Promise.all(notifies.map(async (notify, index) => {
        const isDoubt = index >= normalCount
        const user1Uin = notify.user1.uid ? await ctx.ntUserApi.getUinByUid(notify.user1.uid).catch(() => '') : ''
        const user2Uin = notify.user2.uid ? await ctx.ntUserApi.getUinByUid(notify.user2.uid).catch(() => '') : ''
        return {
          seq: notify.seq,
          notifyType: notify.type,
          status: notify.status,
          doubt: isDoubt,
          group: notify.group,
          user1: { ...notify.user1, uin: user1Uin },
          user2: { ...notify.user2, uin: user2Uin },
          postscript: notify.postscript,
          actionTime: notify.actionTime,
          flag: `${notify.group.groupCode}|${notify.seq}|${notify.type}|${isDoubt ? '1' : '0'}`
        }
      }))
      return c.json({ success: true, data: enriched })
    } catch (e: any) {
      ctx.logger.error('获取群通知失败:', e)
      return c.json({ success: false, message: '获取群通知失败', error: e.message }, 500)
    }
  })

  // 获取好友申请历史
  router.get('/notifications/friend', async (c) => {
    try {
      const result = await ctx.ntFriendApi.getBuddyReq()
      const buddyReqs = (result.buddyReqs || []).filter((reqItem: any) => !reqItem.isInitiator)
      const enriched = await Promise.all(buddyReqs.map(async (reqItem: any) => {
        const uin = reqItem.friendUid ? await ctx.ntUserApi.getUinByUid(reqItem.friendUid).catch(() => '') : ''
        return {
          friendUid: reqItem.friendUid,
          friendUin: uin,
          friendNick: reqItem.friendNick,
          friendAvatarUrl: reqItem.friendAvatarUrl,
          reqTime: reqItem.reqTime,
          extWords: reqItem.extWords,
          isDecide: reqItem.isDecide,
          reqType: reqItem.reqType,
          addSource: reqItem.addSource || '',
          flag: `${reqItem.friendUid}|${reqItem.reqTime}`
        }
      }))
      return c.json({ success: true, data: enriched })
    } catch (e: any) {
      ctx.logger.error('获取好友申请失败:', e)
      return c.json({ success: false, message: '获取好友申请失败', error: e.message }, 500)
    }
  })

  // 获取被过滤的好友申请
  router.get('/notifications/friend/doubt', async (c) => {
    try {
      const result = await ctx.ntFriendApi.getDoubtBuddyReq(50)
      const doubtList = result.doubtList || []
      const enriched = doubtList.map((item: any) => ({
        uid: item.uid,
        nick: item.nick,
        age: item.age,
        sex: item.sex,
        reqTime: item.reqTime,
        msg: item.msg,
        source: item.source,
        reason: item.reason,
        groupCode: item.groupCode,
        commFriendNum: item.commFriendNum,
        flag: `doubt|${item.uid}|${item.reqTime}`
      }))
      return c.json({ success: true, data: enriched })
    } catch (e: any) {
      ctx.logger.error('获取被过滤好友申请失败:', e)
      return c.json({ success: false, message: '获取被过滤好友申请失败', error: e.message }, 500)
    }
  })

  // 处理被过滤的好友申请（仅支持同意）
  router.post('/notifications/friend/doubt/approve', async (c) => {
    try {
      const { uid } = await c.req.json() as { uid: string }
      if (!uid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntFriendApi.approvalDoubtBuddyReq(uid)
      return c.json({ success: true })
    } catch (e: any) {
      ctx.logger.error('处理被过滤好友申请失败:', e)
      return c.json({ success: false, message: '处理被过滤好友申请失败', error: e.message }, 500)
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
    } catch (e: any) {
      ctx.logger.error('处理群通知失败:', e)
      return c.json({ success: false, message: '处理群通知失败', error: e.message }, 500)
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
      const [friendUid, reqTime] = flag.split('|')
      if (!friendUid) {
        return c.json({ success: false, message: '无效的 flag 参数' }, 400)
      }
      await ctx.ntFriendApi.handleFriendRequest(friendUid, reqTime || '0', action === 'approve')
      return c.json({ success: true })
    } catch (e: any) {
      ctx.logger.error('处理好友申请失败:', e)
      return c.json({ success: false, message: '处理好友申请失败', error: e.message }, 500)
    }
  })

  return router
}
