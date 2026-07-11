import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

interface RawMsg {
  msgId: string
  msgTime: number
  elements: Array<{
    elementType?: number
    multiForwardMsgElement?: { resId?: string }
    videoElement?: { fileUuid?: string }
  }>
}

describe('messages endpoints (历史 / 转发 / 视频)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  test('GET /api/webqq/messages (chatType=2 群最近消息)', async () => {
    const data = await client.get<{ messages: RawMsg[]; hasMore: boolean }>(
      '/api/webqq/messages',
      { chatType: 2, peerId: config.test_group_id, limit: 5 },
    )
    expect(data).toBeTruthy()
    expect(Array.isArray(data.messages)).toBe(true)
    expect(typeof data.hasMore).toBe('boolean')
    if (data.messages.length > 0) {
      const m = data.messages[0]
      expect(typeof m.msgId).toBe('string')
      expect(Array.isArray(m.elements)).toBe(true)
    }
  })

  test('GET /api/webqq/messages 缺参返 400', async () => {
    await expect(client.get('/api/webqq/messages')).rejects.toThrow()
  })

  test('GET /api/webqq/messages 非法 chatType 返 400', async () => {
    await expect(client.get('/api/webqq/messages', { chatType: 99, peerId: '12345' })).rejects.toThrow()
  })

  // 翻最近 100 条消息找 multiForwardMsgElement 的 resId 真测一下
  // (resId 必须从真实 server 来，自己生成是无效的)。
  // 群里没合并转发消息时跳过, 不算 fail.
  test('GET /api/webqq/forward-msg 解析合并转发', async () => {
    const data = await client.get<{ messages: RawMsg[] }>('/api/webqq/messages', {
      chatType: 2,
      peerId: config.test_group_id,
      limit: 100,
    })
    let resId: string | undefined
    for (const msg of data.messages) {
      for (const el of msg.elements) {
        if (el.multiForwardMsgElement?.resId) {
          resId = el.multiForwardMsgElement.resId
          break
        }
      }
      if (resId) break
    }
    if (!resId) {
      // eslint-disable-next-line no-console
      console.log('[forward-msg] 群里近 100 条没找到合并转发消息, skip 真测')
      return
    }
    const items = await client.get<Array<{ senderName: string; segments: unknown[] }>>(
      '/api/webqq/forward-msg',
      { resId },
    )
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)
    expect(typeof items[0].senderName).toBe('string')
    expect(Array.isArray(items[0].segments)).toBe(true)
  })

  // 同样: 翻历史找 videoElement.fileUuid 真测
  test('GET /api/webqq/video-url 解析视频 URL', async () => {
    const data = await client.get<{ messages: RawMsg[] }>('/api/webqq/messages', {
      chatType: 2,
      peerId: config.test_group_id,
      limit: 100,
    })
    let fileUuid: string | undefined
    for (const msg of data.messages) {
      for (const el of msg.elements) {
        if (el.videoElement?.fileUuid) {
          fileUuid = el.videoElement.fileUuid
          break
        }
      }
      if (fileUuid) break
    }
    if (!fileUuid) {
      // eslint-disable-next-line no-console
      console.log('[video-url] 群里近 100 条没找到视频消息, skip 真测')
      return
    }
    const url = await client.get<string>('/api/webqq/video-url', { fileUuid, isGroup: 'true' })
    expect(typeof url).toBe('string')
    expect(url.length).toBeGreaterThan(0)
  })
})

