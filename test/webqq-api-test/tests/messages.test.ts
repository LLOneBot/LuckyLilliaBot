import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

describe('messages endpoints (历史 / 转发 / 视频)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  test('GET /api/webqq/messages (chatType=2 群最近消息)', async () => {
    const data = await client.get<{ messages: Array<{ msgId: string; msgTime: number; elements: unknown[] }>; hasMore: boolean }>(
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

  // 不知道 resId 的现成值，跳过
  test.skip('GET /api/webqq/forward-msg?resId=...', () => {})

  // 不知道 fileUuid 的现成值，跳过
  test.skip('GET /api/webqq/video-url?fileUuid=...', () => {})
})
