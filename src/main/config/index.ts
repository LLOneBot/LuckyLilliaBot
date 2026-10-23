import { Context, Service } from 'cordis'
import { DATA_DIR, selfInfo } from '@/common/globalVars'
import { defaultConfig } from './defaultConfig'
import { Config as LLBotConfig, WebUIConfig } from '@/common/types'
import { Dict } from 'cosmokit'
import path from 'node:path'
import fs from 'node:fs'
import JSON5 from 'json5'
import { deepMerge, mergeNewProperties } from '@/common/utils'
import { JsonFile } from '@/common/jsonFile'
import { getSpecifiedUin, isDevMode } from '@/common/utils/environment'

declare module 'cordis' {
  interface Context {
    config: Config
  }
}

/** 已废弃、迁移完成后从磁盘删掉的顶层 key。只显式列已知的, 不再按白名单删未知 key。 */
const DEPRECATED_KEYS = ['onlyLocalhost']

/** 进程级覆盖: 容器/托管环境用它定端口和日志级别, 值只进内存不落盘。 */
const ENV_OVERRIDES: { env: string; path: string[]; parse: (raw: string) => unknown }[] = [
  { env: 'LLBOT_WEBUI_HOST', path: ['webui', 'host'], parse: raw => raw },
  { env: 'LLBOT_WEBUI_PORT', path: ['webui', 'port'], parse: raw => (Number.isFinite(+raw) ? +raw : undefined) },
  { env: 'LLBOT_LOG_LEVEL', path: ['logLevel'], parse: raw => (raw === 'debug' || raw === 'info' ? raw : undefined) },
]

interface EnvLock {
  env: string
  /** 文件里这个字段的值, 每次落盘前还原回去 */
  disk: unknown
  /** 环境变量给的值, get() 报告的就是它 */
  value: unknown
}

function parentOf(root: unknown, keys: string[]): Dict | undefined {
  let node = root
  for (const key of keys.slice(0, -1)) {
    if (!node || typeof node !== 'object') return
    node = (node as Dict)[key]
  }
  return node && typeof node === 'object' ? node as Dict : undefined
}

/** 把当前进程的 LLBOT_* 原地叠到 config 上, 返回每个被覆盖字段的锁记录; 值不合法的变量忽略。 */
function overlayEnv(config: LLBotConfig): Map<string, EnvLock> {
  const locks = new Map<string, EnvLock>()
  for (const { env, path: keys, parse } of ENV_OVERRIDES) {
    const raw = process.env[env]
    if (raw === undefined || raw === '') continue
    const value = parse(raw)
    const parent = parentOf(config, keys)
    if (value === undefined || !parent) continue
    const leaf = keys[keys.length - 1]
    locks.set(keys.join('.'), { env, disk: parent[leaf], value })
    parent[leaf] = value
  }
  return locks
}

export default class Config extends Service {
  private configPath: string | undefined
  private config: LLBotConfig | null = null
  private watching = false
  private file: JsonFile<LLBotConfig> | undefined
  /** 被 LLBOT_* 覆盖的字段, 按路径 ('webui.port') 索引 */
  private envLocked = new Map<string, EnvLock>()
  private defaultConfigPath = path.join(import.meta.dirname, 'default_config.json')
  private logger
  private readonly WATCH_DEBOUNCE_MS = 2000
  /** 保存 fs.watchFile 的回调引用，用于 unwatchFile 清理 */
  private watchFileListener?: (curr: fs.Stats, prev: fs.Stats) => void

  constructor(ctx: Context) {
    super(ctx, 'config')
    this.logger = ctx.logger('config')
  }

  async [Service.init]() {
    return () => {
      if (this.configPath && this.watchFileListener) {
        fs.unwatchFile(this.configPath, this.watchFileListener)
        this.watchFileListener = undefined
      }
    }
  }

  listenChange(cb: (config: LLBotConfig) => void) {
    this.logger.info('配置文件位于', this.configPath)

    this.config = this.get()
    if (this.configPath) {
      let lastReloadTime = 0
      this.watchFileListener = () => {
        if (!this.watching) return
        // 自己刚写的那次改动不算外部修改 (比旧的 skipNextWatch 标志可靠: 不会吞掉紧随其后的外部编辑)
        if (this.file?.isSelfWriteOnDisk()) return
        // 防止 fs.watchFile 短时间内多次触发
        const now = Date.now()
        if (now - lastReloadTime < this.WATCH_DEBOUNCE_MS) return
        lastReloadTime = now
        this.logger.info('配置重載')
        const c = this.reloadConfig()
        cb(c)
      }
      fs.watchFile(this.configPath, { persistent: false, interval: 1000 }, this.watchFileListener)
      setTimeout(() => this.watching = true, 1500)
    }
  }

  get(cache = true) {
    if (this.config && cache) {
      return this.config
    }

    // 登录前 selfInfo.uin 为空: 若 argv 带了 -q <uin> 且对应 config_<uin>.json 已存在, 提前用它
    // (让 WebUI/logLevel 直接起在目标账号配置上, 免去登录后从 default 端口/token 重启的窗口)。
    // 只读不建文件: 新账号 (文件不存在) 仍走 default, 建文件留给登录成功后的 get(false)。
    let uin = selfInfo.uin
    if (!uin) {
      const argUin = getSpecifiedUin()
      if (argUin && fs.existsSync(path.join(DATA_DIR, `config_${argUin}.json`))) {
        uin = argUin
      }
    }
    const nextPath = uin ? path.join(DATA_DIR, `config_${uin}.json`) : undefined
    if (nextPath !== this.configPath || !this.file) {
      this.configPath = nextPath
      this.file = nextPath
        ? new JsonFile<LLBotConfig>(nextPath, { defaultValue: () => this.getDefaultConfig() })
        : undefined
    }

    return this.reloadConfig()
  }

  private getDefaultConfig(): LLBotConfig {
    const _defaultConfig = { ...defaultConfig }
    const defaultConfigFromFile = fs.readFileSync(this.defaultConfigPath, 'utf-8')
    try {
      const parsedDefaultConfig: LLBotConfig = JSON5.parse(defaultConfigFromFile)
      Object.assign(_defaultConfig, parsedDefaultConfig)
    } catch (e) {
      this.logger.error('解析 default_config.json 错误', e)
    }
    return _defaultConfig
  }

  private reloadConfig(): LLBotConfig {
    if (!this.configPath || !this.file) {
      // 登录前且没带 -q: 默认值 + 环境变量 (它们是进程级的, 登录前就该生效)。不缓存, 登录后 get(false) 再切到账号文件
      const config = this.getDefaultConfig()
      this.envLocked = overlayEnv(config)
      return config
    }
    let config: LLBotConfig
    if (!fs.existsSync(this.configPath)) {
      config = this.getDefaultConfig()
      this.file.writeSync(config)
    } else {
      const { data, error } = this.file.readSync()
      if (error) {
        // 坏文件保留原地、不覆盖, 也不广播 default: 继续用上一份有效配置, 下次轮询重试
        this.logger.error(`${this.configPath} json 内容不合格, 继续使用上一份有效配置`, error)
        if (this.config) return this.config
        config = this.getDefaultConfig()
        this.envLocked = overlayEnv(config)
        return config
      }
      this.logger.info('配置加载成功')
      config = this.migrateConfig(data)
      // 只补不删: 未知 key 一律保留 (旧的白名单清理会把 defaultConfig.ts 里没有的 logLevel 永久吃掉)
      mergeNewProperties(this.getDefaultConfig(), config)
      config.webui = this.migrateWebUIToken(config.webui)
      for (const key of DEPRECATED_KEYS) delete (config as Dict)[key]
      // 补齐缺省后写回。此刻还没叠环境变量, config 就是磁盘真值, 直接写、不经 stripEnv
      // (stripEnv 用的是上一次加载记下的原值, 会把外部刚改过的锁定字段写回旧值)。只在内容真变了时写
      if (JSON.stringify(config, null, 2) + '\n' !== this.file.rawSync()) this.file.writeSync(config)
    }
    this.envLocked = overlayEnv(config)
    this.config = config
    return config
  }

  /** 还原被环境变量覆盖的字段为磁盘原值, 供落盘使用。 */
  private stripEnv(config: LLBotConfig): LLBotConfig {
    if (!this.envLocked.size) return config
    const clone = structuredClone(config)
    for (const [key, { disk }] of this.envLocked) {
      const keys = key.split('.')
      const parent = parentOf(clone, keys)
      if (!parent) continue
      const leaf = keys[keys.length - 1]
      if (disk === undefined) delete parent[leaf]
      else parent[leaf] = disk
    }
    return clone
  }

  /** 内存里的锁定字段始终是环境变量的值, 不管调用方传进来什么。 */
  private pinEnv(config: LLBotConfig) {
    for (const [key, { value }] of this.envLocked) {
      const keys = key.split('.')
      const parent = parentOf(config, keys)
      if (parent) parent[keys[keys.length - 1]] = value
    }
  }

  /** 被环境变量锁定的字段, WebUI 据此把它们显示为只读并注明是哪个变量。 */
  envLocks(): { path: string; env: string }[] {
    return [...this.envLocked].map(([path, { env }]) => ({ path, env }))
  }

  envLockedPaths(): string[] {
    return [...this.envLocked.keys()]
  }

  /**
   * patch(partial) 会得到的配置, 不落盘。被环境变量锁定的字段先从 partial 里剔除 ——
   * 否则它们会在内存里盖掉环境变量的值 (磁盘那边由 stripEnv 兜着)。供校验用: 校验的对象和真正落盘的完全一致。
   */
  preview(partial: Dict): LLBotConfig {
    const cleaned = structuredClone(partial)
    for (const key of this.envLocked.keys()) {
      const keys = key.split('.')
      const parent = parentOf(cleaned, keys)
      if (parent) delete parent[keys[keys.length - 1]]
    }
    return deepMerge(this.get(), cleaned) as LLBotConfig
  }

  /**
   * 合并一份局部配置并落盘。顶层 / 嵌套对象逐 key 合并, 数组和标量整体替换。
   * 取代"整份覆盖"的 set(): 之前 set_config 只传一个字段就会把其余配置全部清掉。
   */
  patch(partial: Dict): LLBotConfig {
    const next = this.preview(partial)
    this.set(next)
    return next
  }

  /**
   * 某个账号配置文件的生效值 (叠了环境变量)。不建文件、不切换当前配置、不写盘、不碰 envLocked ——
   * 登录流程在 "online 先于 get(false) 切到账号配置" 的窗口里, 靠它预判 WebUI 登录后会在哪。
   */
  peek(uin: string): LLBotConfig {
    const file = path.join(DATA_DIR, `config_${uin}.json`)
    let config = this.getDefaultConfig()
    if (fs.existsSync(file)) {
      const { data, error } = new JsonFile<LLBotConfig>(file, { defaultValue: () => this.getDefaultConfig() }).readSync()
      if (!error) {
        config = this.migrateConfig(data)
        mergeNewProperties(this.getDefaultConfig(), config)
      }
    }
    overlayEnv(config)
    return config
  }

  set(config: LLBotConfig) {
    this.config = config
    this.writeConfig(config)
    this.pinEnv(config)
  }

  private writeConfig(config: LLBotConfig) {
    // 先写临时文件再 rename, 中途崩溃不会留下半截配置; 写入内容记哈希供 watchFile 回调识别自写。
    // stripEnv: 用户在同一次保存里改了别的字段时, 不把环境变量的值一起固化进文件。
    this.file?.writeSync(this.stripEnv(config))
  }


  private migrateConfig(oldConfig: Dict): LLBotConfig {
    let migratedConfig = oldConfig
    if (oldConfig.musicSignUrl && oldConfig.musicSignUrl.includes('linyuchen')) {
      oldConfig.musicSignUrl = defaultConfig.musicSignUrl
    }
    // 先迁移 ob11.connect 数组格式
    if (!oldConfig.ob11 || !Array.isArray(oldConfig.ob11.connect)) {
      const ob11 = oldConfig.ob11 || {}
      migratedConfig = {
        ...oldConfig,
        ob11: {
          enable: ob11.enable || false,
          connect: [
            {
              type: 'ws',
              enable: ob11.enableWs || false,
              port: ob11.wsPort || 3001,
              heartInterval: oldConfig.heartInterval || 30000,
              token: ob11.token || '',
              messageFormat: ob11.messagePostFormat || 'array',
              reportSelfMessage: ob11.reportSelfMessage || false,
              reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
              debug: oldConfig.debug || false,
            },
            {
              type: 'ws-reverse',
              enable: ob11.enableWsReverse || false,
              url: (ob11.wsReverseUrls && ob11.wsReverseUrls[0]) || '',
              heartInterval: oldConfig.heartInterval || 30000,
              token: ob11.token || '',
              messageFormat: ob11.messagePostFormat || 'array',
              reportSelfMessage: ob11.reportSelfMessage || false,
              reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
              debug: oldConfig.debug || false,
            },
            {
              type: 'http',
              enable: ob11.enableHttp || false,
              port: ob11.httpPort || 3000,
              token: ob11.token || '',
              messageFormat: ob11.messagePostFormat || 'array',
              reportSelfMessage: ob11.reportSelfMessage || false,
              reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
              debug: oldConfig.debug || false,
            },
            {
              type: 'http-post',
              enable: ob11.enableHttpPost || false,
              url: (ob11.httpPostUrls && ob11.httpPostUrls[0]) || '',
              enableHeart: ob11.enableHttpHeart || false,
              heartInterval: oldConfig.heartInterval || 30000,
              token: ob11.httpSecret || '',
              messageFormat: ob11.messagePostFormat || 'array',
              reportSelfMessage: ob11.reportSelfMessage || false,
              reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
              debug: oldConfig.debug || false,
            },
          ],
        },
      }
    }

    // 迁移 onlyLocalhost 配置项
    if ('onlyLocalhost' in oldConfig) {
      const host = oldConfig.onlyLocalhost ? '127.0.0.1' : ''

      if (migratedConfig.webui && !migratedConfig.webui.host) {
        migratedConfig.webui.host = host
      }
      if (migratedConfig.satori && !migratedConfig.satori.host) {
        migratedConfig.satori.host = host
      }
      if (migratedConfig.milky?.http && !migratedConfig.milky.http.host) {
        migratedConfig.milky.http.host = host
      }
      if (Array.isArray(migratedConfig.ob11?.connect)) {
        for (const conn of migratedConfig.ob11.connect) {
          if ((conn.type === 'ws' || conn.type === 'http') && !conn.host) {
            conn.host = host
          }
        }
      }
      delete migratedConfig.onlyLocalhost
    }

    return migratedConfig as LLBotConfig
  }

  private migrateWebUIToken(oldWebuiConfig: WebUIConfig & { token?: string }) {
    if (oldWebuiConfig.token && !webuiTokenUtil.getToken()) {
      webuiTokenUtil.setToken(oldWebuiConfig.token)
      delete oldWebuiConfig['token']
    }
    return oldWebuiConfig
  }
}

class WebUITokenUtil {
  private token: string = ''

  constructor(private readonly tokenPath: string) {
    this.tokenPath = tokenPath
  }

  getToken() {
    if (!this.token) {
      if (fs.existsSync(this.tokenPath)) {
        this.token = fs.readFileSync(this.tokenPath, 'utf-8').trim()
      }
    }
    return this.token
  }

  setToken(token: string) {
    this.token = token.trim()
    fs.writeFileSync(this.tokenPath, token, 'utf-8')
  }
}

export const webuiTokenUtil = new WebUITokenUtil(path.join(DATA_DIR, 'webui_token.txt'))

// data/auth_token.txt (--dev: data/auth_token.dev.txt, keeps the local-manager token apart from the real one)
class AuthTokenUtil {
  private token: string = ''
  private loaded = false

  constructor(private readonly tokenPath: string) {
    this.tokenPath = tokenPath
  }

  getToken() {
    if (!this.loaded) {
      if (fs.existsSync(this.tokenPath)) {
        this.token = fs.readFileSync(this.tokenPath, 'utf-8').trim()
      }
      this.loaded = true
    }
    return this.token
  }

  /** 绝对路径, 给报错提示直接告诉用户去哪贴 token. */
  getPath() {
    return path.resolve(this.tokenPath)
  }

  setToken(token: string) {
    this.token = token.trim()
    fs.writeFileSync(this.tokenPath, this.token, 'utf-8')
    this.loaded = true
  }

  reload() {
    this.loaded = false
    return this.getToken()
  }
}

export const authTokenUtil = new AuthTokenUtil(path.join(DATA_DIR, isDevMode() ? 'auth_token.dev.txt' : 'auth_token.txt'))


