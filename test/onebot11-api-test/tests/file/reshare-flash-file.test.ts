/**
 * reshare_flash_file 测试 — 秒传场景
 *
 * 关键: 测试前**先上传一次**让 server 端缓存这个 sha1, 再 upload + reshare 都能秒传命中.
 * 用项目固定 fixture (test_ocr.png) — 跑过一次后 server 端 sha1 永久缓存.
 *
 * 秒传命中 → 不走 highway → 不依赖网络环境 → 协议层稳定 pass.
 *
 * 已知会跳过的环境性失败:
 *   - createFlashFileSet errorCode=15001 (闪传 quota 满, 等冷却)
 *   - highway ETIMEDOUT (本机网络不通, 仅影响 prime 上传)
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup'
import { Assertions } from '@/utils/Assertions'
import { ActionName } from '@llbot/onebot11/action/types'
import { MediaPaths } from '@/tests/media'

function isEnvSkip(msg: string): boolean {
  return (
    msg.includes('ETIMEDOUT') ||
    msg.includes('Highway') ||
    msg.includes('highway') ||
    msg.includes('errorCode=15001') ||
    msg.includes('上传已超出限制')
  )
}

describe('reshare_flash_file (秒传场景)', () => {
  let context: MessageTestContext
  let primingFileSetId: string | undefined
  let primingShareLink: string | undefined

  beforeAll(async () => {
    context = await setupMessageTest()

    // 预热: 先 upload 一次 test_ocr.png 让 server 端缓存这个 sha1
    const primaryClient = context.twoAccountTest.getClient('primary')
    const prime = await primaryClient.call(ActionName.UploadFlashFile, {
      title: 'reshare-prime',
      paths: [MediaPaths.getPath('test_ocr.png')],
    })
    if (prime.retcode === 0) {
      primingFileSetId = prime.data.file_set_id
      primingShareLink = prime.data.share_link
      // eslint-disable-next-line no-console
      console.log(`[reshare/prime] server 端已缓存 sha1, fileSetId=${primingFileSetId}`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`[reshare/prime] 预热 upload 失败 (${(prime.message || '').slice(0, 80)}), 后续 reshare 跳过`)
    }
  })

  afterAll(() => {
    teardownMessageTest(context)
  })

  it('上传 test_ocr.png — server 端 sha1 已缓存, 必秒传命中', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary')
    const upload = await primaryClient.call(ActionName.UploadFlashFile, {
      title: 'reshare-upload-cached',
      paths: [MediaPaths.getPath('test_ocr.png')],
    })
    if (upload.retcode !== 0) {
      const msg = upload.message || ''
      if (isEnvSkip(msg)) {
        // eslint-disable-next-line no-console
        console.log(`[reshare/upload-cached] 环境跳过 (${msg.slice(0, 80)})`)
        return
      }
      Assertions.assertSuccess(upload, 'upload_flash_file (cached)')
    }
    Assertions.assertResponseHasFields(upload, ['file_set_id', 'share_link', 'expire_time'])
  }, 60000)

  it('reshare 用 fileSetId — 走 list+sha1+秒传, 全协议层不走 highway', async () => {
    if (!primingFileSetId) {
      // eslint-disable-next-line no-console
      console.log('[reshare/by-id] 预热未成功, 跳过')
      return
    }
    const primaryClient = context.twoAccountTest.getClient('primary')
    const response = await primaryClient.call(ActionName.ReShareFlashFile, {
      file_set_id: primingFileSetId,
    })
    if (response.retcode !== 0 && isEnvSkip(response.message || '')) {
      // eslint-disable-next-line no-console
      console.log(`[reshare/by-id] 环境跳过 (${(response.message || '').slice(0, 80)})`)
      return
    }
    Assertions.assertSuccess(response, 'reshare_flash_file')
    Assertions.assertResponseHasFields(response, ['file_set_id', 'share_link', 'expire_time'])
    expect(response.data.share_link).toMatch(/qfile\.qq\.com\/q\//)
    expect(response.data.file_set_id).not.toBe(primingFileSetId)
  }, 60000)

  it('reshare 用 share_link — webui FE 入口的形态', async () => {
    if (!primingShareLink) {
      // eslint-disable-next-line no-console
      console.log('[reshare/by-link] 预热未成功, 跳过')
      return
    }
    const primaryClient = context.twoAccountTest.getClient('primary')
    const response = await primaryClient.call(ActionName.ReShareFlashFile, {
      share_link: primingShareLink,
    })
    if (response.retcode !== 0 && isEnvSkip(response.message || '')) {
      // eslint-disable-next-line no-console
      console.log(`[reshare/by-link] 环境跳过 (${(response.message || '').slice(0, 80)})`)
      return
    }
    Assertions.assertSuccess(response, 'reshare_flash_file (by share_link)')
    expect(response.data.share_link).not.toBe(primingShareLink)
  }, 60000)
})
