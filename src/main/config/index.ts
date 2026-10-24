import { Context, Service } from 'cordis'
import { DATA_DIR } from '@/common/globalVars'
import { Config as LLBotConfig, WebUIConfig } from '@/common/types'
import { Dict } from 'cosmokit'
import path from 'node:path'
import fs from 'node:fs'
import { deepMerge, mergeNewProperties } from '@/common/utils'
import { JsonFile } from '@/common/jsonFile'
import { isDevMode } from '@/common/utils/environment'
import { configPaths } from '@/common/configPaths'
import { templateConfig, upgradeConfig } from './upgrade'

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

/**
 * The bot's own settings: one file per instance, data/instances/<name>/settings.json (config-storage §7),
 * bound when the service starts and kept across logins. get() hands out the file plus the LLBOT_* overrides.
 */
export default class Config extends Service {
  private config: LLBotConfig | null = null
  private watching = false
  private readonly json: JsonFile<Dict>
  /** 被 LLBOT_* 覆盖的字段, 按路径 ('webui.port') 索引 */
  private envLocked = new Map<string, EnvLock>()
  private logger
  private readonly WATCH_DEBOUNCE_MS = 2000
  private unwatch: (() => void)[] = []

  constructor(ctx: Context) {
    super(ctx, 'config')
    this.logger = ctx.logger('config')
    this.json = new JsonFile<Dict>(configPaths.settings(), { defaultValue: () => ({}) })
  }

  async [Service.init]() {
    return () => {
      this.unwatch.forEach(stop => stop())
      this.unwatch = []
    }
  }

  get file(): string {
    return this.json.file
  }

  listenChange(cb: (config: LLBotConfig) => void) {
    this.get()
    this.logger.info('配置文件位于', this.json.file)
    let lastReloadTime = 0
    const listener = () => {
      if (!this.watching) return
      // 自己刚写的那次改动不算外部修改 (比旧的 skipNextWatch 标志可靠: 不会吞掉紧随其后的外部编辑)
      if (this.json.isSelfWriteOnDisk()) return
      // 防止 fs.watchFile 短时间内多次触发
      const now = Date.now()
      if (now - lastReloadTime < this.WATCH_DEBOUNCE_MS) return
      lastReloadTime = now
      this.logger.info('配置重載')
      cb(this.reloadConfig())
    }
    fs.watchFile(this.json.file, { persistent: false, interval: 1000 }, listener)
    this.unwatch.push(() => fs.unwatchFile(this.json.file, listener))
    setTimeout(() => this.watching = true, 1500)
  }

  get(cache = true) {
    if (this.config && cache) {
      return this.config
    }
    return this.reloadConfig()
  }

  private reloadConfig(): LLBotConfig {
    let data: Dict
    if (!fs.existsSync(this.json.file)) {
      // A new instance starts from the template, like a new account file used to
      data = this.templateConfig()
    } else {
      const { data: read, error } = this.json.readSync()
      if (error) {
        // 坏文件保留原地、不覆盖, 也不广播 default: 继续用上一份有效配置, 下次轮询重试
        this.logger.error(`${this.json.file} json 内容不合格, 继续使用上一份有效配置`, error)
        if (this.config) return this.config
        const config = this.templateConfig()
        this.envLocked = overlayEnv(config)
        return config
      }
      this.logger.info('配置加载成功')
      data = read
    }
    const config = upgradeConfig(data)
    // 只补不删: 未知 key 一律保留 (旧的白名单清理会把 defaultConfig.ts 里没有的 logLevel 永久吃掉)
    mergeNewProperties(this.templateConfig(), config)
    config.webui = this.migrateWebUIToken(config.webui)
    for (const key of DEPRECATED_KEYS) delete (config as Dict)[key]
    // 补齐缺省后写回。此刻还没叠环境变量, config 就是磁盘真值, 直接写、不经 stripEnv
    // (stripEnv 用的是上一次加载记下的原值, 会把外部刚改过的锁定字段写回旧值)
    this.writeIfChanged(config)
    this.envLocked = overlayEnv(config)
    this.config = config
    return config
  }

  private templateConfig(): LLBotConfig {
    return templateConfig(e => this.logger.error('解析 default_config.json 错误', e))
  }

  /** An untouched file keeps its mtime and fires no watcher. */
  private writeIfChanged(config: LLBotConfig) {
    if (JSON.stringify(config, null, 2) + '\n' !== this.json.rawSync()) this.json.writeSync(config as unknown as Dict)
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

  set(config: LLBotConfig) {
    this.config = config
    // stripEnv: 用户在同一次保存里改了别的字段时, 不把环境变量的值一起固化进文件
    this.writeIfChanged(this.stripEnv(config))
    this.pinEnv(config)
  }

  private migrateWebUIToken(oldWebuiConfig: WebUIConfig & { token?: string }) {
    if (oldWebuiConfig.token && !webuiTokenUtil.getToken()) {
      webuiTokenUtil.setToken(oldWebuiConfig.token)
      delete oldWebuiConfig['token']
    }
    return oldWebuiConfig
  }
}

export class WebUITokenUtil {
  private token: string = ''
  private mtimeMs = -1

  /** The path is looked up on use: it depends on the instance, which is only fixed after the startup migration. */
  constructor(private readonly tokenPath: () => string) {}

  /**
   * Re-read whenever the file changed: the desktop app or a hand edit can reset the password while the bot
   * runs. A file that went missing keeps the last password rather than opening the WebUI to everyone.
   */
  getToken() {
    let mtimeMs: number
    try {
      mtimeMs = fs.statSync(this.tokenPath()).mtimeMs
    } catch {
      return this.token
    }
    if (mtimeMs !== this.mtimeMs) {
      this.token = fs.readFileSync(this.tokenPath(), 'utf-8').trim()
      this.mtimeMs = mtimeMs
    }
    return this.token
  }

  setToken(token: string) {
    this.token = token.trim()
    const file = this.tokenPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, token, 'utf-8')
    this.mtimeMs = fs.statSync(file).mtimeMs
  }
}

export const webuiTokenUtil = new WebUITokenUtil(() => configPaths.webuiToken())

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
