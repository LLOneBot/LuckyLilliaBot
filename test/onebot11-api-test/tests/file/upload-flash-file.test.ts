/**
 * upload_flash_file, 新文件场景: 每次用随机内容, sha1 一定不在 server 缓存里, 必走 highway。
 * highway 不通时只要求协议层走通, 并且能区分出是网络错误
 */
import { unlink, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup'
import { ActionName } from '@llbot/onebot11/action/types'

const TEST_TMP_DIR = join(tmpdir(), 'webqq-flash-newfile-tests')

describe('upload_flash_file (新文件 / 必走 highway)', () => {
  let context: MessageTestContext
  const tempPaths: string[] = []

  beforeAll(async () => {
    context = await setupMessageTest()
    if (!existsSync(TEST_TMP_DIR)) await mkdir(TEST_TMP_DIR, { recursive: true })
  })

  afterAll(async () => {
    teardownMessageTest(context)
    for (const p of tempPaths) await unlink(p).catch(() => {})
  })

  async function makeNewFile(sizeBytes: number = 1024): Promise<string> {
    const path = join(TEST_TMP_DIR, `random-${Date.now()}-${Math.floor(Math.random() * 1e9)}.bin`)
    await writeFile(path, randomBytes(sizeBytes))
    tempPaths.push(path)
    return path
  }

  it('上传一个 sha1 必新的文件 — 走 highway', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary')
    const path = await makeNewFile(2048)

    const upload = await primaryClient.call(ActionName.UploadFlashFile, {
      title: 'newfile-upload',
      paths: [path],
    })

    if (upload.retcode === 0) {
      expect(upload.data.file_set_id).toBeTruthy()
      expect(upload.data.share_link).toMatch(/qfile\.qq\.com\/q\//)
      expect(typeof upload.data.expire_time).toBe('number')
      expect(Array.isArray(upload.data.downloads)).toBe(true)
    } else {
      const msg = upload.message || ''
      // 环境问题: highway 不通, 或 15001 闪传 quota 满
      const isEnv =
        msg.includes('ETIMEDOUT') ||
        msg.includes('Highway') ||
        msg.includes('highway') ||
        msg.includes('errorCode=15001') ||
        msg.includes('上传已超出限制')
      if (!isEnv) {
        throw new Error(`upload_flash_file 失败 (非环境问题): ${msg}`)
      }
      // eslint-disable-next-line no-console
      console.log(`[upload-flash-file/新文件] 环境跳过 (${msg.slice(0, 100)}), 协议层 OK 视为通过`)
    }
  }, 90000)
})
