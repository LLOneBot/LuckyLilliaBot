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

  // 真改 server 端收藏列表 — 默认 skip
  // 即使开了 RUN_DESTRUCTIVE 也容易超时: highway upload 走的是 QQ 服务器
  // p.qlogo.cn:15000，本地网络不一定通 (实测多个 IP 都 ETIMEDOUT)，
  // 即使秒传命中也要先做 BDHExpressionRoam prep RPC，所以加单独 RUN_FAV_EMOJI_ADD 才跑。
  const runFavEmojiAdd = isDestructiveEnabled && process.env.RUN_FAV_EMOJI_ADD === '1' ? test : test.skip
  runFavEmojiAdd('POST /api/webqq/fav-emoji/add-from-url 添加成功', async () => {
    const { config } = await loadClient()
    const url = `https://p.qlogo.cn/gh/${config.test_group_id}/${config.test_group_id}/640/`
    const result = await client.post<{ retCode?: number; result?: number; isExist?: boolean }>(
      '/api/webqq/fav-emoji/add-from-url',
      { url },
    )
    expect(result).toBeTruthy()
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
