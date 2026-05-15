import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../../helpers/testApp'
import { createMockContext } from '../../helpers/mockContext'
import { createNotificationRoutes } from '@/webui/BE/routes/webqq/notifications'

describe('notification routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('GET /notifications/group', () => {
    it('returns enriched group notifications', async () => {
      ctx.ntGroupApi.getGroupRequest.mockResolvedValue({
        notifies: [
          {
            seq: '1',
            type: 1,
            status: 0,
            group: { groupCode: '111', groupName: 'TestGroup' },
            user1: { uid: 'uid1' },
            user2: { uid: 'uid2' },
            postscript: 'hello',
            actionTime: '1234567890',
          },
        ],
        normalCount: 1,
      })
      ctx.ntUserApi.getUinByUid.mockResolvedValue('999')
      const app = createTestApp(createNotificationRoutes(ctx))

      const res = await app.request('/notifications/group')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(1)
      expect(body.data[0].flag).toContain('111')
      expect(body.data[0].user1.uin).toBe('999')
    })

    it('handles getUinByUid failure gracefully', async () => {
      ctx.ntGroupApi.getGroupRequest.mockResolvedValue({
        notifies: [{
          seq: '1', type: 1, status: 0,
          group: { groupCode: '111' },
          user1: { uid: 'uid1' },
          user2: { uid: '' },
          postscript: '',
          actionTime: '',
        }],
        normalCount: 1,
      })
      ctx.ntUserApi.getUinByUid.mockRejectedValue(new Error('not found'))
      const app = createTestApp(createNotificationRoutes(ctx))

      const res = await app.request('/notifications/group')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data[0].user1.uin).toBe('')
    })
  })

  describe('GET /notifications/friend', () => {
    it('returns friend requests excluding initiator', async () => {
      ctx.ntFriendApi.getBuddyReq.mockResolvedValue({
        buddyReqs: [
          { friendUid: 'u1', isInitiator: false, friendNick: 'A', reqTime: '100', extWords: '', reqType: 1 },
          { friendUid: 'u2', isInitiator: true, friendNick: 'B', reqTime: '200', extWords: '', reqType: 1 },
        ],
      })
      const app = createTestApp(createNotificationRoutes(ctx))

      const res = await app.request('/notifications/friend')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].friendNick).toBe('A')
    })
  })

  describe('GET /notifications/friend/doubt', () => {
    it('returns doubt friend requests', async () => {
      ctx.ntFriendApi.getDoubtBuddyReq.mockResolvedValue({
        doubtList: [
          { uid: 'u1', nick: 'Test', age: 20, sex: 1, reqTime: '100', msg: 'hi', source: '', reason: '', groupCode: '', commFriendNum: 0 },
        ],
      })
      const app = createTestApp(createNotificationRoutes(ctx))

      const res = await app.request('/notifications/friend/doubt')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].flag).toBe('doubt|u1|100')
    })
  })

  describe('POST /notifications/friend/doubt/approve', () => {
    it('returns 400 when uid is missing', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/friend/doubt/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('approves on success', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/friend/doubt/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: 'u1' }),
      })
      expect(res.status).toBe(200)
      expect(ctx.ntFriendApi.approvalDoubtFriendRequest).toHaveBeenCalledWith('u1')
    })
  })

  describe('POST /notifications/group/handle', () => {
    it('returns 400 when flag or action is missing', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/group/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: '111|1|1|0' }),
      })
      expect(res.status).toBe(400)
    })

    it('calls handleGroupRequest with approve', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/group/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: '111|1|1|0', action: 'approve' }),
      })
      expect(res.status).toBe(200)
      expect(ctx.ntGroupApi.handleGroupRequest).toHaveBeenCalledWith('111|1|1|0', 1, undefined)
    })

    it('calls handleGroupRequest with reject', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/group/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: '111|1|1|0', action: 'reject', reason: 'no' }),
      })
      expect(res.status).toBe(200)
      expect(ctx.ntGroupApi.handleGroupRequest).toHaveBeenCalledWith('111|1|1|0', 2, 'no')
    })
  })

  describe('POST /notifications/friend/handle', () => {
    it('returns 400 when flag or action is missing', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/friend/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: 'uid|100' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid flag', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/friend/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: '', action: 'approve' }),
      })
      expect(res.status).toBe(400)
    })

    it('handles friend request correctly', async () => {
      const app = createTestApp(createNotificationRoutes(ctx))
      const res = await app.request('/notifications/friend/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: 'uid123', action: 'approve' }),
      })
      expect(res.status).toBe(200)
      expect(ctx.ntFriendApi.approvalFriendRequest).toHaveBeenCalledWith('uid123', true)
    })
  })
})
