import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient, isDestructiveEnabled } from '../helpers/setup.js'
import type { WebQQApiClient } from '../core/index.js'

const destructive = isDestructiveEnabled ? test : test.skip

describe('fav-emoji endpoints (收藏表情)', () => {
  let client: WebQQApiClient

  beforeAll(async () => {
    ;({ client } = await loadClient())
  })

  test('GET /api/webqq/fav-emoji 返列表 + emojiInfoList 数组', async () => {
    // BE 直接返 ntMsgApi.getCustomFaceList() 的结果，含 retCode + emojiInfoList
    const data = await client.get<{ retCode?: number; emojiInfoList: Array<{ emoId: number; resId?: string; url: string }> }>(
      '/api/webqq/fav-emoji',
    )
    expect(data).toBeTruthy()
    expect(Array.isArray(data.emojiInfoList)).toBe(true)
    if (data.emojiInfoList.length > 0) {
      const e = data.emojiInfoList[0]
      expect(typeof e.emoId).toBe('number')
      expect(typeof e.url).toBe('string')
    }
  })

  // 真改 server 端收藏列表 — 默认 skip
  // 用一张 QQ CDN 上确实存在的图（任何之前从 webui 看到过的群图都行）
  // 这里复用 bot 自己头像作为温和的探针 - p.qlogo.cn 在 image-proxy 白名单里
  destructive('POST /api/webqq/fav-emoji/add-from-url 添加成功', async () => {
    const { config } = await loadClient()
    const url = `https://p.qlogo.cn/gh/${config.test_group_id}/${config.test_group_id}/640/`
    const result = await client.post<{ retCode?: number; result?: number; isExist?: boolean }>(
      '/api/webqq/fav-emoji/add-from-url',
      { url },
    )
    expect(result).toBeTruthy()
    // addCustomFace 返 retCode 0 = 成功；isExist=true 也算 OK (重复添加)
    const ok = result.retCode === 0 || result.result === 0 || result.isExist === true
    expect(ok).toBe(true)
  })

  test('POST /api/webqq/fav-emoji/add-from-url 缺 url 返 400', async () => {
    await expect(client.post('/api/webqq/fav-emoji/add-from-url', {})).rejects.toThrow()
  })

  test('POST /api/webqq/fav-emoji/add-from-url 不允许域名拒掉', async () => {
    await expect(
      client.post('/api/webqq/fav-emoji/add-from-url', { url: 'https://example.com/evil.png' }),
    ).rejects.toThrow()
  })

  test('POST /api/webqq/fav-emoji/delete 缺 emojiIds 返 400', async () => {
    await expect(client.post('/api/webqq/fav-emoji/delete', {})).rejects.toThrow()
  })
})
