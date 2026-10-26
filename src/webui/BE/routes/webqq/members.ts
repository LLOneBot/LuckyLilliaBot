import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import { Hono } from 'hono'
import { serializeResult } from '../../utils'

export function createMembersRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/members', async (c) => {
    try {
      const { groupCode } = c.req.query() as { groupCode: string }

      if (!groupCode) {
        return c.json({ success: false, message: '缺少群号参数' }, 400)
      }

      const result = await ctx.ntGroupApi.getGroupMembers(+groupCode, false)
      const members: Dict[] = []

      for (const member of result) {
        const role = member.role === 4 ? 'owner' : member.role === 3 ? 'admin' : 'member'
        members.push({
          uid: member.uid,
          uin: member.uin.toString(),
          nickname: member.nick,
          card: member.cardName || '',
          // not 640: that spec is missing on some accounts, see FE getUserAvatar
          avatar: `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=140`,
          role,
          level: member.level,
          specialTitle: member.specialTitle
        })
      }

      const roleOrder = { owner: 0, admin: 1, member: 2 }
      members.sort((a, b) => roleOrder[a.role as keyof typeof roleOrder] - roleOrder[b.role as keyof typeof roleOrder])

      return c.json({ success: true, data: members })
    } catch (e) {
      ctx.logger.error('获取群成员失败:', e)
      return c.json({ success: false, message: '获取群成员失败', error: (e as Error).message }, 500)
    }
  })

  // 兼容旧调用
  router.get('/user-info', async (c) => {
    try {
      const { uid } = c.req.query() as { uid: string }

      if (!uid) {
        return c.json({ success: false, message: '缺少 uid 参数' }, 400)
      }

      const userInfo = await ctx.ntUserApi.getUserByUid(uid)
      const uin = await ctx.ntUserApi.getUinByUid(uid)

      return c.json({
        success: true,
        data: {
          uid: uid,
          uin: uin.toString(),
          nickname: userInfo.nick,
          remark: userInfo.remark
        }
      })
    } catch (e) {
      ctx.logger.error('获取用户信息失败:', e)
      return c.json({ success: false, message: '获取用户信息失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/group-member', async (c) => {
    try {
      const { groupCode, uid } = c.req.query() as { groupCode: string, uid: string }
      if (!groupCode || !uid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const member = await ctx.ntGroupApi.getGroupMemberByUid(+groupCode, uid, false)
      if (!member) {
        return c.json({ success: true, data: null })
      }
      return c.json({ success: true, data: serializeResult(member) })
    } catch (e) {
      ctx.logger.error('获取群成员详情失败:', e)
      return c.json({ success: false, message: '获取群成员详情失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/group-detail', async (c) => {
    try {
      const { groupCode } = c.req.query() as { groupCode: string }
      if (!groupCode) {
        return c.json({ success: false, message: '缺少 groupCode 参数' }, 400)
      }
      const group = await ctx.ntGroupApi.getGroup(+groupCode, false)
      return c.json({ success: true, data: serializeResult(group) })
    } catch (e) {
      ctx.logger.error('获取群详情失败:', e)
      return c.json({ success: false, message: '获取群详情失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/uid', async (c) => {
    try {
      const { uin, groupCode } = c.req.query() as { uin: string, groupCode?: string }
      if (!uin) {
        return c.json({ success: false, message: '缺少 uin 参数' }, 400)
      }
      const uid = await ctx.ntUserApi.getUidByUin(+uin, groupCode ? +groupCode : undefined)
      return c.json({ success: true, data: uid })
    } catch (e) {
      ctx.logger.error('uin → uid 失败:', e)
      return c.json({ success: false, message: 'uin → uid 失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/uin', async (c) => {
    try {
      const { uid } = c.req.query() as { uid: string }
      if (!uid) {
        return c.json({ success: false, message: '缺少 uid 参数' }, 400)
      }
      const uin = await ctx.ntUserApi.getUinByUid(uid)
      return c.json({ success: true, data: uin?.toString() ?? '' })
    } catch (e) {
      ctx.logger.error('uid → uin 失败:', e)
      return c.json({ success: false, message: 'uid → uin 失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/user', async (c) => {
    try {
      const { uid, uin } = c.req.query() as { uid?: string, uin?: string }
      if (!uid && !uin) {
        return c.json({ success: false, message: '需要 uid 或 uin 参数之一' }, 400)
      }
      const user = uid
        ? await ctx.ntUserApi.getUserByUid(uid)
        : await ctx.ntUserApi.getUserByUin(+uin!)
      return c.json({ success: true, data: serializeResult(user) })
    } catch (e) {
      ctx.logger.error('获取用户详情失败:', e)
      return c.json({ success: false, message: '获取用户详情失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
