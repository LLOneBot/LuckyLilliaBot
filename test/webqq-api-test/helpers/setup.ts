import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebQQApiClient, type TestConfig } from '../core/ApiClient.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROJECT_ROOT = resolve(__dirname, '../../..')
const DATA_DIR = join(PROJECT_ROOT, 'data')
const TOKEN_PATH = join(DATA_DIR, 'webui_token.txt')
const CONFIG_PATH = resolve(__dirname, '../config/test.config.json')

let cached: { client: WebQQApiClient; config: TestConfig } | null = null

interface BotConfig {
  webui?: { enable?: boolean; host?: string; port?: number }
}

/**
 * 自动找出当前在跑的 bot：
 *   - 优先 BOT_UIN env 显式指定
 *   - 否则用 data/qq-session-<uin>.json 里 mtime 最新那个
 *   - 单 session 文件 (legacy data/qq-session.json) 时, 找唯一的 data/config_<uin>.json
 */
function detectBotUin(): string {
  if (process.env.BOT_UIN) return process.env.BOT_UIN

  const sessionFiles = existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR)
        .filter((f) => /^qq-session-\d+\.json$/.test(f))
        .map((f) => ({ name: f, uin: f.match(/qq-session-(\d+)\.json/)![1], mtime: statSync(join(DATA_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
    : []
  if (sessionFiles.length > 0) return sessionFiles[0].uin

  const configFiles = existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR).filter((f) => /^config_\d+\.json$/.test(f))
    : []
  if (configFiles.length === 1) {
    return configFiles[0].match(/config_(\d+)\.json/)![1]
  }
  throw new Error(
    `无法自动检测 bot uin: 未发现 qq-session-*.json，且 config_*.json 文件不止一个。请用 BOT_UIN=xxx 环境变量指定，或写 test.config.json`,
  )
}

function loadBotConfig(uin: string): BotConfig {
  const path = join(DATA_DIR, `config_${uin}.json`)
  if (!existsSync(path)) {
    throw new Error(`找不到 bot 配置 ${path} (BOT_UIN=${uin})`)
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as BotConfig
}

/** 从 bot 实际配置自动生成 TestConfig + 读 webui_token.txt 拿密码 */
function autoConfig(): { config: TestConfig; password: string } {
  const uin = detectBotUin()
  const botConfig = loadBotConfig(uin)
  const webui = botConfig.webui
  if (!webui?.enable) throw new Error(`bot ${uin} 的 webui 未启用 (config.webui.enable=false)`)
  if (!webui.port) throw new Error(`bot ${uin} 的 webui.port 缺失`)

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(`找不到 webui token 文件 ${TOKEN_PATH} (bot 还没设过 webui 密码？)`)
  }
  const password = readFileSync(TOKEN_PATH, 'utf-8').trim()
  if (!password) throw new Error(`${TOKEN_PATH} 为空`)

  // host 用 127.0.0.1 而非 0.0.0.0
  const host = `http://127.0.0.1:${webui.port}`

  // test_group_id / test_user_id env 优先；fallback 复用 OB11 测试 config 里的 (避免重复填)
  let testGroupId = process.env.TEST_GROUP_ID || ''
  let testUserId = process.env.TEST_USER_ID || ''
  if (!testGroupId || !testUserId) {
    const ob11Config = join(PROJECT_ROOT, 'test/onebot11-api-test/config/test.config.json')
    if (existsSync(ob11Config)) {
      try {
        const ob11 = JSON.parse(readFileSync(ob11Config, 'utf-8')) as {
          test_group_id?: string
          accounts?: { primary?: { user_id?: string }; secondary?: { user_id?: string } }
        }
        if (!testGroupId && ob11.test_group_id) testGroupId = ob11.test_group_id
        if (!testUserId) {
          // 找跟当前 bot 不同的那个账号当 test_user_id (这样测试 fetchUserDetailInfo 等才有意义)
          const primary = ob11.accounts?.primary?.user_id
          const secondary = ob11.accounts?.secondary?.user_id
          if (primary && primary !== uin) testUserId = primary
          else if (secondary && secondary !== uin) testUserId = secondary
        }
      } catch { /* ignore */ }
    }
  }
  if (!testUserId) testUserId = uin  // 最后兜底用自己

  return {
    config: {
      host,
      user_id: uin,
      test_group_id: testGroupId,
      test_user_id: testUserId,
    },
    password,
  }
}

/**
 * 加载 config + 实例化 client + 跑 healthCheck。Jest 各 test 文件用这个拿 client。
 *
 * 配置来源优先级:
 *   1. test/webqq-api-test/config/test.config.json (手工写的, 显式覆盖一切)
 *   2. 自动: 从 data/config_<uin>.json + data/webui_token.txt 推
 *      - bot uin: BOT_UIN env > qq-session-*.json mtime 最新 > 唯一的 config_*.json
 *      - test_group_id / test_user_id: TEST_GROUP_ID / TEST_USER_ID env
 */
export async function loadClient(): Promise<{ client: WebQQApiClient; config: TestConfig }> {
  if (cached) return cached

  let config: TestConfig
  let password: string

  if (existsSync(CONFIG_PATH)) {
    // 手工 config 覆盖
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as TestConfig
    for (const k of ['host', 'user_id', 'test_group_id', 'test_user_id'] as const) {
      if (!config[k]) throw new Error(`${CONFIG_PATH} 缺必填字段: ${k}`)
    }
    if (config.password) {
      password = config.password
    } else if (config.password_file) {
      const passwordPath = resolve(dirname(CONFIG_PATH), config.password_file)
      password = readFileSync(passwordPath, 'utf-8').trim()
    } else {
      // 没填 password / password_file, fallback 到 data/webui_token.txt
      if (!existsSync(TOKEN_PATH)) throw new Error('test.config.json 没有 password / password_file 且 data/webui_token.txt 也不在')
      password = readFileSync(TOKEN_PATH, 'utf-8').trim()
    }
  } else {
    // 全自动: bot config + webui_token.txt + (兜底) OB11 test config 拿 test_group_id / test_user_id
    const auto = autoConfig()
    config = auto.config
    password = auto.password
    if (!config.test_group_id) {
      throw new Error(
        '自动模式找不到 test_group_id (没填 TEST_GROUP_ID env, 也没在 test/onebot11-api-test/config/test.config.json 里找到 test_group_id)。' +
        '指定一个测试用群: export TEST_GROUP_ID=xxx',
      )
    }
    // 自动模式下 user_id 先空着, 等 healthCheck 从 webui 拿到真实 uin 再填
    config.user_id = ''
  }

  // 真起 bot 时 webui port 可能跟配置文件不一样 (server.ts 用 getAvailablePort
  // 如果配置端口被占就 +1 +2 ... 找空闲；用户也可能自己改过 webui port)。
  // 先试配置端口, 拒连就 probe 一组常见候选 (config_port +1..+100, 还有 +10000 这种
  // 大跳变 — 实测有时 webui 跑在 13080 之类)。
  let client = new WebQQApiClient(config, password)
  let selfInfo: { uid: string; uin: string; nick?: string }
  try {
    selfInfo = await client.healthCheck()
  } catch (e) {
    const msg = (e as Error)?.message || ''
    const cause = (e as { cause?: { code?: string } })?.cause
    const isConnRefused = msg.includes('ECONNREFUSED') || cause?.code === 'ECONNREFUSED'
    if (!isConnRefused) throw e

    const url = new URL(config.host)
    const startPort = Number(url.port) || 80
    // 候选: startPort+1..+100 (普通 retry), 然后 +10000 偏移和 +10000+1..+10 (常见的"高位 fallback"模式)
    const candidates = [
      ...Array.from({ length: 100 }, (_, i) => startPort + 1 + i),
      ...Array.from({ length: 11 }, (_, i) => startPort + 10000 + i),
    ]
    let foundPort: number | null = null
    for (const p of candidates) {
      url.port = String(p)
      const probeConfig = { ...config, host: url.origin }
      const probeClient = new WebQQApiClient(probeConfig, password)
      try {
        selfInfo = await probeClient.healthCheck()
        foundPort = p
        config = probeConfig
        client = probeClient
        break
      } catch (pe) {
        const pcause = (pe as { cause?: { code?: string } })?.cause
        if (!((pe as Error).message.includes('ECONNREFUSED') || pcause?.code === 'ECONNREFUSED')) throw pe
      }
    }
    if (foundPort === null) {
      throw new Error(
        `webui 在配置 port ${startPort} 没监听, 候选 port 也没找到。` +
        '确认 bot 在跑且 webui 已启用, 或 export TEST_HOST=http://x:port 显式指定。',
      )
    }
    // eslint-disable-next-line no-console
    console.log(`[webqq-api-test] webui 实际跑在 ${config.host} (config 写的是 :${startPort})`)
  }

  // 自动模式 / 配置没填 user_id 时, 用 webui 真实返回的 uin 兜底
  if (!config.user_id) config.user_id = selfInfo!.uin
  // 如果 test_user_id 还是当时自动选的（可能跟实际登录的 bot 一致 → 等于自己）, 提示一下
  if (config.test_user_id === config.user_id) {
    // eslint-disable-next-line no-console
    console.log(`[webqq-api-test] 注意: test_user_id=${config.test_user_id} 等于 bot 自己, 用户详情查询会查到自己`)
  }

  cached = { client, config }
  return cached
}

/** destructive 测试守卫: 只有显式 RUN_DESTRUCTIVE=1 才跑 */
export const isDestructiveEnabled = process.env.RUN_DESTRUCTIVE === '1'
