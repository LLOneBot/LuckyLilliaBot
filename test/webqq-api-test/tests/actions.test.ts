import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient, isDestructiveEnabled } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

const destructive = isDestructiveEnabled ? test : test.skip

describe('actions endpoints (修改类操作 — 默认全 skip, RUN_DESTRUCTIVE=1 才跑)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  // 验证参数缺失分支（非破坏性 - 只发空 body 看 BE 返 400）
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

  // === 真破坏性操作 ===
  // 戳一戳是温和的（对方只看到一个抖动），最小破坏
  destructive('POST /api/webqq/group/poke (戳自己)', async () => {
    const result = await client.post<unknown>('/api/webqq/group/poke', {
      groupCode: config.test_group_id,
      uin: config.user_id,
    })
    // BE 端 success: true 即认为 OK；具体响应内容不一定有 data
    // (出错会被 ApiClient throw)
    expect(result === undefined || result === null || typeof result === 'object').toBe(true)
  })

  destructive('POST /api/webqq/friend/poke (戳自己)', async () => {
    await client.post<unknown>('/api/webqq/friend/poke', { uin: config.user_id })
  })

  // kick / ban / quit / setMemberRole / setTop / msgMask / specialTitle 真改群状态，
  // 不留在自动化里跑 — 需要时手工 curl 验证。
  // 同样 friend/delete / friend/set-top 也太危险，不自动化。
})
