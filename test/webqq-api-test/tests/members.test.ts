import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

describe('members + user endpoints (查询型 GET)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  test('GET /api/webqq/members?groupCode 返成员数组', async () => {
    const members = await client.get<Array<{ uid: string; uin: string; nickname: string; role: string }>>(
      '/api/webqq/members',
      { groupCode: config.test_group_id },
    )
    expect(Array.isArray(members)).toBe(true)
    expect(members.length).toBeGreaterThan(0)
    const m = members[0]
    expect(typeof m.uid).toBe('string')
    expect(typeof m.uin).toBe('string')
    expect(['owner', 'admin', 'member']).toContain(m.role)
  })

  test('GET /api/webqq/uid?uin 转换 OK + 反向 /uin?uid 还原', async () => {
    const uid = await client.get<string>('/api/webqq/uid', { uin: config.test_user_id })
    expect(typeof uid).toBe('string')
    expect(uid).toMatch(/^u_/)

    const uinBack = await client.get<string>('/api/webqq/uin', { uid })
    expect(uinBack).toBe(config.test_user_id)
  })

  test('GET /api/webqq/user?uin 返 nick + level + uin 字段', async () => {
    const user = await client.get<{ uin: string | number; nick: string; level: number; qid?: string }>(
      '/api/webqq/user',
      { uin: config.test_user_id },
    )
    expect(user).toBeTruthy()
    expect(String(user.uin)).toBe(config.test_user_id)
    expect(typeof user.nick).toBe('string')
    expect(user.nick.length).toBeGreaterThan(0)
    expect(typeof user.level).toBe('number')
  })

  test('GET /api/webqq/user?uid (跟 uin 等效)', async () => {
    const uid = await client.get<string>('/api/webqq/uid', { uin: config.test_user_id })
    const user = await client.get<{ uin: string | number; nick: string }>('/api/webqq/user', { uid })
    expect(String(user.uin)).toBe(config.test_user_id)
  })

  test('GET /api/webqq/group-member?groupCode&uid 返单成员', async () => {
    // 先从 list 拿一个 uid
    const members = await client.get<Array<{ uid: string }>>('/api/webqq/members', {
      groupCode: config.test_group_id,
    })
    expect(members.length).toBeGreaterThan(0)
    const targetUid = members[0].uid

    const member = await client.get<{ nick?: string; cardName?: string; role: number } | null>(
      '/api/webqq/group-member',
      { groupCode: config.test_group_id, uid: targetUid },
    )
    expect(member).toBeTruthy()
    expect(typeof member!.role).toBe('number')
  })

  test('GET /api/webqq/group-detail 返群信息', async () => {
    const group = await client.get<{ groupCode: number | string; groupName: string; memberCount?: number }>(
      '/api/webqq/group-detail',
      { groupCode: config.test_group_id },
    )
    expect(group).toBeTruthy()
    expect(String(group.groupCode)).toBe(config.test_group_id)
    expect(typeof group.groupName).toBe('string')
  })

  test('GET /api/webqq/user-info?uid (兼容老 endpoint)', async () => {
    const uid = await client.get<string>('/api/webqq/uid', { uin: config.test_user_id })
    const info = await client.get<{ uid: string; uin: string; nickname: string }>('/api/webqq/user-info', { uid })
    expect(info.uid).toBe(uid)
    expect(info.uin).toBe(config.test_user_id)
    expect(typeof info.nickname).toBe('string')
  })
})
