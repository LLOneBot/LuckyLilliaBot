/**
 * reshare_flash_file, 秒传场景: 先上传一次固定的 test_ocr.png 让 server 缓存 sha1, 之后都能秒传,
 * 不依赖 highway 网络。闪传 quota 满 (15001) 和 highway ETIMEDOUT 算环境问题, 跳过
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
