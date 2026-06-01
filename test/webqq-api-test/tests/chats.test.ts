import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient } from '../core/index.js'

describe('chats endpoints (列表型 GET)', () => {
  let client: WebQQApiClient

  beforeAll(async () => {
    ;({ client } = await loadClient())
  })

  test('GET /api/webqq/friends 返 categories 数组', async () => {
    // BE 直接返 ntFriendApi.getFriends(true) 的原始 shape: { friends: any[], categories: Record<number, any> }
    const data = await client.get<{ friends: unknown[]; categories: Record<string, unknown> }>('/api/webqq/friends')
    expect(data).toBeTruthy()
    expect(Array.isArray(data.friends)).toBe(true)
    expect(typeof data.categories).toBe('object')
  })

  test('GET /api/webqq/groups 返群数组', async () => {
    const groups = await client.get<Array<{ groupCode: number; groupName: string; memberCount?: number }>>('/api/webqq/groups')
    expect(Array.isArray(groups)).toBe(true)
    if (groups.length > 0) {
      const g = groups[0]
      expect(typeof g.groupCode).toBe('number')
      expect(typeof g.groupName).toBe('string')
    }
  })

  test('GET /api/webqq/pins 返 { friends, groups } 结构', async () => {
    const pins = await client.get<{ friends: unknown[]; groups: unknown[] }>('/api/webqq/pins')
    expect(Array.isArray(pins.friends)).toBe(true)
    expect(Array.isArray(pins.groups)).toBe(true)
  })
})
