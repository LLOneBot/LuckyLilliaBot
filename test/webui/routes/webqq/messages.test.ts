import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../../helpers/testApp'
import { createMockContext } from '../../helpers/mockContext'
import { createMessagesRoutes } from '@/webui/BE/routes/webqq/messages'

// Mock heavy dependencies
vi.mock('@/ntqqapi/entities', () => ({
  SendElement: {
    face: vi.fn((id: number) => ({ elementType: 6, elementId: '', faceElement: { faceIndex: id } })),
    file: vi.fn(() => Promise.resolve({ elementType: 3, elementId: '' })),
  },
}))

vi.mock('@/ntqqapi/proto', () => ({
  Msg: { QSmallFaceExtra: { decode: vi.fn() } },
  Media: { MsgInfo: { decode: vi.fn() } },
}))

describe('messages routes', () => {
  let ctx: ReturnType<typeof createMockContext>
  const createPicElement = vi.fn()

  beforeEach(() => {
    ctx = createMockContext()
    createPicElement.mockReset()
  })

  function makeApp() {
    return createTestApp(createMessagesRoutes(ctx, createPicElement))
  }

  describe('GET /messages', () => {
    it('returns 400 when chatType or peerId is missing', async () => {
      const app = makeApp()
      const res = await app.request('/messages')
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid chatType', async () => {
      const app = makeApp()
      const res = await app.request('/messages?chatType=99&peerId=123')
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('chatType')
    })

    it('fetches latest messages for group chat', async () => {
      ctx.ntMsgApi.getAioFirstViewLatestMsgs.mockResolvedValue({
        msgList: [
          { msgId: '1', msgTime: '200', elements: [] },
          { msgId: '2', msgTime: '100', elements: [] },
        ],
      })
      const app = makeApp()

      const res = await app.request('/messages?chatType=2&peerId=12345')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      // sorted by msgTime ascending
      expect(body.data.messages[0].msgTime).toBe('100')
      expect(body.data.messages[1].msgTime).toBe('200')
    })

    it('converts peerId to uid for C2C chat', async () => {
      ctx.ntUserApi.getUidByUin.mockResolvedValue('uid-from-uin')
      ctx.ntMsgApi.getAioFirstViewLatestMsgs.mockResolvedValue({ msgList: [] })
      const app = makeApp()

      await app.request('/messages?chatType=1&peerId=123456')
      expect(ctx.ntUserApi.getUidByUin).toHaveBeenCalledWith(123456)
    })

    it('fetches messages before given seq', async () => {
      ctx.ntMsgApi.getMsgsBySeqAndCount.mockResolvedValue({ msgList: [] })
      const app = makeApp()

      await app.request('/messages?chatType=2&peerId=111&beforeMsgSeq=50')
      expect(ctx.ntMsgApi.getMsgsBySeqAndCount).toHaveBeenCalled()
    })

    it('fetches messages after given seq', async () => {
      ctx.ntMsgApi.getMsgsBySeqAndCount.mockResolvedValue({ msgList: [] })
      const app = makeApp()

      await app.request('/messages?chatType=2&peerId=111&afterMsgSeq=50')
      expect(ctx.ntMsgApi.getMsgsBySeqAndCount).toHaveBeenCalled()
    })
  })

  describe('POST /messages', () => {
    it('returns 400 when required params missing', async () => {
      const app = makeApp()
      const res = await app.request('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid chatType', async () => {
      const app = makeApp()
      const res = await app.request('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatType: 99, peerId: '123', content: [{ type: 'text', text: 'hi' }] }),
      })
      expect(res.status).toBe(400)
    })

    it('sends text message to group', async () => {
      ctx.ntMsgApi.sendMsg.mockResolvedValue({ msgId: 'sent-1' })
      const app = makeApp()

      const res = await app.request('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatType: 2,
          peerId: '111',
          content: [{ type: 'text', text: 'hello' }],
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.msgId).toBe('sent-1')
    })

    it('returns 400 when content produces no elements', async () => {
      const app = makeApp()
      const res = await app.request('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatType: 2,
          peerId: '111',
          content: [{ type: 'unknown' }],
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('为空')
    })
  })

  describe('GET /forward-msg', () => {
    it('returns 400 when resId is missing', async () => {
      const app = makeApp()
      const res = await app.request('/forward-msg')
      expect(res.status).toBe(400)
    })
  })
})
