import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebQQApiClient, type TestConfig } from '../core/ApiClient.js'
import { UnifiedConfigLoader } from '../../test-framework/src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const LOCAL_CONFIG_PATH = resolve(__dirname, '../config/test.config.json')

let cached: { client: WebQQApiClient; config: TestConfig } | null = null

/** 优先 test/webqq-api-test/config/test.config.json (兼容旧配置), 否则用 test/test.config.json */
export async function loadClient(): Promise<{ client: WebQQApiClient; config: TestConfig }> {
  if (cached) return cached

  let config: TestConfig
  let password: string

  if (existsSync(LOCAL_CONFIG_PATH)) {
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

  // 实际端口可能跟配置不同: 被占时往后找 +1..+100, 多个 bot 同时跑时重启期间还可能被别的 bot 抢走。
  // 所以连不上或 uin 不对都要探测, 直到找到 config.user_id 那个 bot
  let client = new WebQQApiClient(config, password)
  let selfInfo: { uid: string; uin: string; nick?: string }
  const isProbeWorthy = (err: unknown): boolean => {
    const msg = (err as Error)?.message || ''
    const cause = (err as { cause?: { code?: string } })?.cause
    return (
      msg.includes('ECONNREFUSED') ||
      cause?.code === 'ECONNREFUSED' ||
      msg.includes('当前登录 uin=')  // healthCheck uin 不匹配
    )
  }
  try {
    selfInfo = await client.healthCheck()
  } catch (e) {
    if (!isProbeWorthy(e)) throw e

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
        if (!isProbeWorthy(pe)) throw pe
      }
    }
    if (foundPort === null) {
      throw new Error(
        `webui (uin=${config.user_id}) 在配置 port ${startPort} 没监听, 候选 port 也没找到正确 bot。` +
        '确认 bot 在跑且 webui 已启用, 或修正 test/test.config.json 的 bots.primary.webui_http / uin。',
      )
    }
    // eslint-disable-next-line no-console
    console.log(`[webqq-api-test] webui 实际跑在 ${config.host} (config 写的是 :${startPort})`)
  }

  // 以实际登录的 uin 为准, 配置里的可能是 secondary 的, 也可能写错
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
