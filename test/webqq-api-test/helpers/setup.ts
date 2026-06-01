import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebQQApiClient, type TestConfig } from '../core/ApiClient.js'
import { UnifiedConfigLoader } from '../../test-framework/src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const LOCAL_CONFIG_PATH = resolve(__dirname, '../config/test.config.json')

let cached: { client: WebQQApiClient; config: TestConfig } | null = null

/**
 * 加载 config + 实例化 client + 跑 healthCheck。Jest 各 test 文件用这个拿 client。
 *
 * 配置来源优先级:
 *   1. test/webqq-api-test/config/test.config.json (per-suite 老格式, 向后兼容)
 *   2. test/test.config.json (项目级统一配置, UnifiedConfigLoader.forWebQQ)
 *
 * 配置完后, 如果 webui 在 config 写的 port 没监听, 自动 probe 一组常见候选 port
 * (bot 启动时如果配置端口被占, getAvailablePort 会 +N 找空闲)。
 */
export async function loadClient(): Promise<{ client: WebQQApiClient; config: TestConfig }> {
  if (cached) return cached

  let config: TestConfig
  let password: string

  if (existsSync(LOCAL_CONFIG_PATH)) {
    // per-suite 老格式（向后兼容）
    config = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf-8')) as TestConfig
    for (const k of ['host', 'user_id', 'test_group_id', 'test_user_id'] as const) {
      if (!config[k]) throw new Error(`${LOCAL_CONFIG_PATH} 缺必填字段: ${k}`)
    }
    if (config.password) {
      password = config.password
    } else if (config.password_file) {
      const passwordPath = resolve(dirname(LOCAL_CONFIG_PATH), config.password_file)
      password = readFileSync(passwordPath, 'utf-8').trim()
    } else {
      throw new Error(`${LOCAL_CONFIG_PATH} 缺 password 或 password_file`)
    }
  } else {
    // 走项目级 test/test.config.json
    const { config: unified, configPath } = UnifiedConfigLoader.loadUnified()
    const webqqConfig = UnifiedConfigLoader.forWebQQ(unified, configPath)
    config = {
      host: webqqConfig.host,
      user_id: webqqConfig.user_id,
      test_group_id: webqqConfig.test_group_id,
      test_user_id: webqqConfig.test_user_id,
    }
    password = webqqConfig.password
  }

  // 真起 bot 时 webui port 可能跟配置文件不一样 (server.ts 用 getAvailablePort
  // 如果配置端口被占就 +1 +2 ... 找空闲；用户也可能自己改过 webui port)。
  // 先试配置端口, 拒连就 probe 一组常见候选 (config_port +1..+100, 还有 +10000 这种大跳变)。
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
        '确认 bot 在跑且 webui 已启用, 或修正 test/test.config.json 的 bots.primary.webui_http。',
      )
    }
    // eslint-disable-next-line no-console
    console.log(`[webqq-api-test] webui 实际跑在 ${config.host} (config 写的是 :${startPort})`)
  }

  // 用 webui 真实返回的 uin 校正 config.user_id (config 里的可能是 secondary 的, 也可能写错)
  if (selfInfo!.uin !== config.user_id) {
    // eslint-disable-next-line no-console
    console.log(`[webqq-api-test] 注意: 配置 user_id=${config.user_id}, 但 bot 实际登录的是 ${selfInfo!.uin}`)
    config.user_id = selfInfo!.uin
  }
  if (config.test_user_id === config.user_id) {
    // eslint-disable-next-line no-console
    console.log(`[webqq-api-test] 注意: test_user_id=${config.test_user_id} 等于 bot 自己, 用户详情查询会查到自己`)
  }

  cached = { client, config }
  return cached
}

/** destructive 测试守卫: 只有显式 RUN_DESTRUCTIVE=1 才跑 */
export const isDestructiveEnabled = process.env.RUN_DESTRUCTIVE === '1'
