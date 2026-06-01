import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient, TestConfig } from '../core/index.js'

describe('fav-emoji endpoints (收藏表情)', () => {
  let client: WebQQApiClient
  let config: TestConfig

  beforeAll(async () => {
    ;({ client, config } = await loadClient())
  })

  test('GET /api/webqq/fav-emoji 返列表 + emojiInfoList 数组', async () => {
    // BE 直接返 ntMsgApi.getCustomFaceList() 的结果。实测字段:
    //   retCode + errMsg + emojiInfoList[]
    //   每个 entry: { emojiId, url } (跟 FE FavEmojiPicker 类型 emoId/resId/desc 不一样,
    //   FE 那边的 mapping 估计有问题但不在本测试范围)
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

  // POST /fav-emoji/add-from-url 真上传走 highway:15000，本机网络通常 ETIMEDOUT (实测)。
  // 真链路要测得换成不需要 highway 的秒传场景 — 用 image-proxy 已经 fetch 过的 URL,
  // server 端如果 md5 已存在能秒传跳 highway, 但目前 BE 实现里 BDHExpressionRoam prep
  // 不管秒传都要 server 返 IP+ticket, 所以 highway 失败前没法分支。
  // TODO: 等 BE addCustomFace 支持秒传分支，再写真测试。
  test.skip('POST /api/webqq/fav-emoji/add-from-url 添加成功 (highway 网络不通, 暂不测)', () => {})

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
