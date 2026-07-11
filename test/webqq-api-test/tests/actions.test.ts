import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

describe('actions endpoints (修改类操作)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  // === 缺参数分支验证 (无副作用) ===
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

  // === 真打的轻量操作 (戳自己/戳一戳, 副作用最小) ===
  test('POST /api/webqq/group/poke 戳自己', async () => {
    await client.post<unknown>('/api/webqq/group/poke', {
      groupCode: config.test_group_id,
      uin: config.user_id,
    })
    // BE 端 success: true 即认为 OK；失败会被 ApiClient throw
  })

  test('POST /api/webqq/friend/poke 戳自己', async () => {
    await client.post<unknown>('/api/webqq/friend/poke', { uin: config.user_id })
  })

  // === 危险/不可逆操作 — 永久 skip, 自动化里不跑 ===
  // 这些会真改群/好友状态, 误测一次就要手动恢复:
  //   /group/kick   (踢人)         — 需要被踢的人重新申请进群
  //   /group/ban    (禁言)         — 真禁言, 时长不一定准
  //   /group/quit   (退群/解散)    — 群主调用直接解散群
  //   /group/set-top (群置顶)      — 改 client 端置顶状态
  //   /group/msg-mask (消息免打扰)  — 改群消息接收方式
  //   /friend/delete (删好友)      — 真删, 还得重新加
  //   /friend/set-top (好友置顶)   — 改 client 状态
  //   /group/member-role (设管理员)  — 改群权限结构
  //   /group/special-title (头衔)  — 改成员展示头衔
  // 想测就手工 curl, 别让 jest 跑.
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
