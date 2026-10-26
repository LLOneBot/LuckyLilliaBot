import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

describe('actions endpoints (修改类操作)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  test('POST /api/webqq/group/poke 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/group/poke', {})).rejects.toThrow()
  })

  test('POST /api/webqq/friend/poke 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/friend/poke', {})).rejects.toThrow()
  })

  test('POST /api/webqq/group/kick 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/group/kick', {})).rejects.toThrow()
  })

  test('POST /api/webqq/group/ban 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/group/ban', {})).rejects.toThrow()
  })

  test('POST /api/webqq/group/member-role 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/group/member-role', {})).rejects.toThrow()
  })

  test('POST /api/webqq/group/special-title 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/group/special-title', {})).rejects.toThrow()
  })

  test('POST /api/webqq/friend/delete 缺参数返 400', async () => {
    await expect(client.post('/api/webqq/friend/delete', {})).rejects.toThrow()
  })

  test('POST /api/webqq/group/poke 戳自己', async () => {
    await client.post<unknown>('/api/webqq/group/poke', {
      groupCode: config.test_group_id,
      uin: config.user_id,
    })
    // 失败时 ApiClient 会 throw
  })

  test('POST /api/webqq/friend/poke 戳自己', async () => {
    await client.post<unknown>('/api/webqq/friend/poke', { uin: config.user_id })
  })

  // 会真改群 / 好友状态, 误跑一次就得手动恢复 (群主调 /group/quit 会直接解散群), 要测就手工 curl
  test.skip('POST /api/webqq/group/kick (危险, 不自动化)', () => {})
  test.skip('POST /api/webqq/group/ban (危险, 不自动化)', () => {})
  test.skip('POST /api/webqq/group/quit (危险, 不自动化)', () => {})
  test.skip('POST /api/webqq/group/set-top (改状态, 不自动化)', () => {})
  test.skip('POST /api/webqq/group/msg-mask (改状态, 不自动化)', () => {})
  test.skip('POST /api/webqq/friend/delete (危险, 不自动化)', () => {})
  test.skip('POST /api/webqq/friend/set-top (改状态, 不自动化)', () => {})
  test.skip('POST /api/webqq/group/member-role (改权限, 不自动化)', () => {})
  test.skip('POST /api/webqq/group/special-title (改成员展示, 不自动化)', () => {})
})
