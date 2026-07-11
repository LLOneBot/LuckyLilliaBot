import { describe, test, expect, beforeAll } from '@jest/globals'
import { loadClient } from '../helpers/setup.js'
import type { WebQQApiClient } from '../core/index.js'

describe('fav-emoji endpoints (收藏表情)', () => {
  let client: WebQQApiClient

  beforeAll(async () => {
    ;({ client } = await loadClient())
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

  // POST /fav-emoji/add-from-url 真上传走 highway:15000.
  //
  // 实测: server 返一组 highway IP (实测有 6 个), 但本地网络到这组 IP 全部
  // ETIMEDOUT (连 80/443 也通不了, 不是端口防火墙问题, 是 IP 段路由不通).
  // bot 代码已经做了 fallback 轮询 + 8s connect timeout (src/ntqqapi/helper/highway.ts),
  // 但 server 池里的 IP 全死的话 bot 没辙。
  //
  // 想跑这个测试需要: bot 在能直连 QQ highway IP 段的网络里 (云服务器/办公室)。
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
