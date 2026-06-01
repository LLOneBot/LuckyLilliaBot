import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebQQApiClient, type TestConfig } from '../core/ApiClient.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CONFIG_PATH = resolve(__dirname, '../config/test.config.json')

let cached: { client: WebQQApiClient; config: TestConfig } | null = null

/**
 * 加载 config + 实例化 client + 跑 healthCheck。Jest 各 test 文件用这个拿 client。
 * 同一进程多次调用复用同一 client 实例（jest worker 内 cache）。
 */
export async function loadClient(): Promise<{ client: WebQQApiClient; config: TestConfig }> {
  if (cached) return cached

  let raw: string
  try {
    raw = readFileSync(CONFIG_PATH, 'utf-8')
  } catch {
    throw new Error(
      `找不到 ${CONFIG_PATH}，先 cp config/test.config.example.json config/test.config.json 并填好 host / password / user_id / test_group_id / test_user_id`,
    )
  }
  const config = JSON.parse(raw) as TestConfig
  for (const k of ['host', 'password', 'user_id', 'test_group_id', 'test_user_id'] as const) {
    if (!config[k]) throw new Error(`config 缺少必填字段: ${k}`)
  }

  const client = new WebQQApiClient(config)
  await client.healthCheck()  // 启动一次 — 测试集开始就先确认 bot 在线 + token 对

  cached = { client, config }
  return cached
}

/** destructive 测试守卫: 只有显式 RUN_DESTRUCTIVE=1 才跑 */
export const isDestructiveEnabled = process.env.RUN_DESTRUCTIVE === '1'
