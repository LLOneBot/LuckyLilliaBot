import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient } from '../core/index.js'

describe('fav-emoji endpoints (收藏表情)', () => {
  let client: WebQQApiClient

  beforeAll(async () => {
    ;({ client } = await loadClient())
  })

  test('GET /api/webqq/fav-emoji 返列表 + emojiInfoList 数组', async () => {
    // 后端直接返 getCustomFaceList(): { retCode, errMsg, emojiInfoList: [{ emojiId, url }] },
    // 跟 FE FavEmojiPicker 用的 emoId / resId / desc 对不上
    const data = await client.get<{ retCode?: number; emojiInfoList: Array<{ emojiId?: string; url: string }> }>(
      '/api/webqq/fav-emoji',
    )
    expect(data).toBeTruthy()
    expect(Array.isArray(data.emojiInfoList)).toBe(true)
    if (data.emojiInfoList.length > 0) {
      const e = data.emojiInfoList[0]
      expect(typeof e.url).toBe('string')
      // emojiId 是 "<uin>_0_0_0_<MD5>_0_0" 形式
      if (e.emojiId !== undefined) {
        expect(typeof e.emojiId).toBe('string')
      }
    }
  })

  // 真上传走 highway: 本机到 server 给的那组 highway IP 路由不通 (全 ETIMEDOUT), highway.ts 轮询换 IP 也没用。
  // 要在能直连 highway 的网络里跑
  test.skip('POST /api/webqq/fav-emoji/add-from-url 添加成功 (本机网络到 highway IP 全 ETIMEDOUT, 暂跳过)', () => {})

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
