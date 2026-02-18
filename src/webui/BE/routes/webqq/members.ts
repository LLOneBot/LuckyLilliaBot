import { Router } from 'express'
import { Context } from 'cordis'

export function createMembersRoutes(ctx: Context): Router {
  const router = Router()

  // 获取群成员列表
  router.get('/members', async (req, res) => {
    try {
      const { groupCode } = req.query as { groupCode: string }

      if (!groupCode) {
        res.status(400).json({ success: false, message: '缺少群号参数' })
        return
      }

      const result = await ctx.ntGroupApi.getGroupMembers(groupCode)
      const members: any[] = []

      if (result?.result?.infos) {
        for (const [uid, member] of result.result.infos) {
          const role = member.role === 4 ? 'owner' : member.role === 3 ? 'admin' : 'member'
          members.push({
            uid: member.uid,
            uin: member.uin,
            nickname: member.nick,
            card: member.cardName || '',
            avatar: `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=640`,
            role,
            level: member.memberRealLevel || member.memberLevel || 0,
            specialTitle: member.memberSpecialTitle || ''
          })
        }
      }

      // 按角色排序：群主 > 管理员 > 成员
      const roleOrder = { owner: 0, admin: 1, member: 2 }
      members.sort((a, b) => roleOrder[a.role as keyof typeof roleOrder] - roleOrder[b.role as keyof typeof roleOrder])

      res.json({ success: true, data: members })
    } catch (e: any) {
      ctx.logger.error('获取群成员失败:', e)
      res.status(500).json({ success: false, message: '获取群成员失败', error: e.message })
    }
  })

  // 获取用户信息（通过 uid）- 保留兼容
  router.get('/user-info', async (req, res) => {
    try {
      const { uid } = req.query as { uid: string }

      if (!uid) {
        res.status(400).json({ success: false, message: '缺少 uid 参数' })
        return
      }

      const userInfo = await ctx.ntUserApi.getUserSimpleInfo(uid, false)
      const uin = await ctx.ntUserApi.getUinByUid(uid)

      res.json({
        success: true,
        data: {
          uid: userInfo.uid,
          uin: uin || '',
          nickname: userInfo.coreInfo?.nick || '',
          remark: userInfo.coreInfo?.remark || ''
        }
      })
    } catch (e: any) {
      ctx.logger.error('获取用户信息失败:', e)
      res.status(500).json({ success: false, message: '获取用户信息失败', error: e.message })
    }
  })

  return router
}
