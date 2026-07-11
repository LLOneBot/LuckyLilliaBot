import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../../helpers/testApp'
import { createMockContext } from '../../helpers/mockContext'
import { createMembersRoutes } from '@/webui/BE/routes/webqq/members'

describe('members routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('GET /members', () => {
    it('returns 400 when groupCode is missing', async () => {
      const app = createTestApp(createMembersRoutes(ctx))
      const res = await app.request('/members')
      expect(res.status).toBe(400)
    })

    it('returns sorted member list', async () => {
      const infos = new Map([
        ['uid1', { uid: 'uid1', uin: '111', nick: 'Admin', cardName: '', role: 2, memberRealLevel: 5, memberLevel: 0, memberSpecialTitle: '' }],
        ['uid2', { uid: 'uid2', uin: '222', nick: 'Owner', cardName: 'Boss', role: 1, memberRealLevel: 10, memberLevel: 0, memberSpecialTitle: '' }],
        ['uid3', { uid: 'uid3', uin: '333', nick: 'Member', cardName: '', role: 0, memberRealLevel: 1, memberLevel: 0, memberSpecialTitle: '' }],
      ])
      ctx.ntGroupApi.getGroupMembers.mockResolvedValue(infos)
      const app = createTestApp(createMembersRoutes(ctx))

      const res = await app.request('/members?groupCode=12345')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(3)
      // owner first, then admin, then member
      expect(body.data[0].role).toBe('owner')
      expect(body.data[1].role).toBe('admin')
      expect(body.data[2].role).toBe('member')
    })

    it('returns 500 on error', async () => {
      ctx.ntGroupApi.getGroupMembers.mockRejectedValue(new Error('fail'))
      const app = createTestApp(createMembersRoutes(ctx))
      const res = await app.request('/members?groupCode=12345')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /user-info', () => {
    it('returns 400 when uid is missing', async () => {
      const app = createTestApp(createMembersRoutes(ctx))
      const res = await app.request('/user-info')
      expect(res.status).toBe(400)
    })

    it('returns user info', async () => {
      ctx.ntUserApi.getUserSimpleInfo.mockResolvedValue({
        uid: 'uid1',
        coreInfo: { nick: 'TestUser', remark: 'friend' },
      })
      ctx.ntUserApi.getUinByUid.mockResolvedValue('111')
      const app = createTestApp(createMembersRoutes(ctx))

      const res = await app.request('/user-info?uid=uid1')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.nickname).toBe('TestUser')
      expect(body.data.uin).toBe('111')
    })

    it('returns 500 on error', async () => {
      ctx.ntUserApi.getUserSimpleInfo.mockRejectedValue(new Error('fail'))
      const app = createTestApp(createMembersRoutes(ctx))
      const res = await app.request('/user-info?uid=uid1')
      expect(res.status).toBe(500)
    })
  })
})
