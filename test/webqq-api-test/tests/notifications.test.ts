import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient } from '../core/index.js'

describe('notifications endpoints (群通知 / 好友申请)', () => {
  let client: WebQQApiClient

  beforeAll(async () => {
    ;({ client } = await loadClient())
  })

  test('GET /api/webqq/notifications/group 返通知数组', async () => {
    const list = await client.get<unknown[]>('/api/webqq/notifications/group')
    expect(Array.isArray(list)).toBe(true)
    // 没有 pending 通知是正常的，只断结构是数组
  })

  test('GET /api/webqq/notifications/friend 返好友申请数组', async () => {
    const list = await client.get<unknown[]>('/api/webqq/notifications/friend')
    expect(Array.isArray(list)).toBe(true)
  })

  test('GET /api/webqq/notifications/friend/doubt 返被过滤申请数组', async () => {
    const list = await client.get<unknown[]>('/api/webqq/notifications/friend/doubt')
    expect(Array.isArray(list)).toBe(true)
  })
})
