import { Context, Service } from 'cordis'
import { DATA_DIR, selfInfo } from '@/common/globalVars'
import { defaultConfig } from './defaultConfig'
import { Config as LLBotConfig, WebUIConfig } from '@/common/types'
import { Dict } from 'cosmokit'
import path from 'node:path'
import fs from 'node:fs'
import JSON5 from 'json5'
import { mergeNewProperties } from '@/common/utils'

declare module 'cordis' {
  interface Context {
    config: Config
  }
}

export default class Config extends Service {
  private configPath: string | undefined
  private config: LLBotConfig | null = null
  private watching = false
  private skipNextWatch = false
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
        if (this.skipNextWatch) {
          this.skipNextWatch = false
          return
        }
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

    this.configPath = selfInfo.uin ? path.join(DATA_DIR, `config_${selfInfo.uin}.json`) : undefined

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
    if (!this.configPath) {
      return this.getDefaultConfig()
    }
    if (!fs.existsSync(this.configPath)) {
      this.config = this.getDefaultConfig()
      this.set(this.config)
      return this.config
    }
    else {
      const data = fs.readFileSync(this.configPath, 'utf-8')
      let jsonData: LLBotConfig = defaultConfig
      try {
        jsonData = JSON5.parse(data)
        this.logger.info('配置加载成功')
        jsonData = this.migrateConfig(jsonData)
        mergeNewProperties(defaultConfig, jsonData)
        jsonData.webui = this.migrateWebUIToken(jsonData.webui)
        jsonData = this.cleanupConfig(defaultConfig, jsonData) as LLBotConfig
        // 只在配置内容实际变化时才写入文件，避免触发 watchFile 导致无限重载
        const newData = JSON.stringify(jsonData, null, 2)
        if (newData !== data) {
          this.set(jsonData)
        }
        this.config = jsonData
        return this.config
      } catch (e) {
        this.logger.error(`${this.configPath} json 内容不合格`, e)
        this.config = this.getDefaultConfig()
        return this.config
      }
    }
  }

  set(config: LLBotConfig) {
    this.config = config
    this.writeConfig(config)
  }

  private writeConfig(config: LLBotConfig) {
    if (!this.configPath) {
      return
    }
    // 跳过本次自身写入触发的 watchFile 回调
    this.skipNextWatch = true
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }


  /**
   * 递归清理配置对象，以 defaultConfig 为基准，删除 oldConfig 中不存在于 defaultConfig 的 key
   */
  private cleanupConfig(defaultConfig: Dict, oldConfig: Dict): Dict {
    // 如果不是对象，直接返回
    if (typeof defaultConfig !== 'object' || defaultConfig === null || Array.isArray(defaultConfig)) {
      return oldConfig
    }
    if (typeof oldConfig !== 'object' || oldConfig === null) {
      return oldConfig
    }

    const cleaned: Dict = {}

    // 遍历 defaultConfig 的 key
    for (const key in defaultConfig) {
      if (defaultConfig.hasOwnProperty(key)) {
        // 如果 oldConfig 中存在该 key
        if (oldConfig.hasOwnProperty(key)) {
          const defaultValue = defaultConfig[key]
          const oldValue = oldConfig[key]

          // 如果 defaultValue 是普通对象（非数组），递归清理
          if (
            typeof defaultValue === 'object' &&
            defaultValue !== null &&
            !Array.isArray(defaultValue) &&
            typeof oldValue === 'object' &&
            oldValue !== null &&
            !Array.isArray(oldValue)
          ) {
            cleaned[key] = this.cleanupConfig(defaultValue, oldValue)
          } else {
            // 否则直接使用 oldConfig 的值
            cleaned[key] = oldValue
          }
        } else {
          // oldConfig 中不存在该 key，使用 defaultConfig 的值
          cleaned[key] = defaultConfig[key]
        }
      }
    }

    return cleaned
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

// data/auth_token.txt
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

export const authTokenUtil = new AuthTokenUtil(path.join(DATA_DIR, 'auth_token.txt'))

// auth token 校验服务 (契约同 Desktop preflight / install 脚本): GET + Authorization: Bearer
export const AUTH_VALIDATE_API = 'https://api-auth.luckylillia.com/api/sign/info'

/**
 * 校验 auth token 是否有效.
 * 2xx=valid, 401/403=invalid (失效/无权限), 网络失败/超时/其它状态=error (无法判定).
 * 纯 HTTP 探测, 不依赖 native sign 初始化, 未登录时也能用.
 */
export async function validateAuthToken(token: string): Promise<'valid' | 'invalid' | 'error'> {
  const t = token.trim()
  if (!t) return 'invalid'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(AUTH_VALIDATE_API, {
      headers: { Authorization: `Bearer ${t}` },
      signal: controller.signal,
    })
    if (res.ok) return 'valid'
    if (res.status === 401 || res.status === 403) return 'invalid'
    return 'error'
  } catch {
    return 'error'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 拉取 token 的 allowed_uins (GET /api/sign/info 返回体里带). 用于登录前预检当前 uin 是否被授权:
 * 不在列表里的 uin 一旦走真 uin 签名 (/api/sign/compute), native SDK 对 403 会 process.exit 崩进程,
 * 所以必须在签名前用这个列表拦截. 拿不到 (网络失败/非 2xx/解析失败) 返回 null, 调用方应放行不拦截.
 */
export async function getAllowedUins(token: string): Promise<number[] | null> {
  const t = token.trim()
  if (!t) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(AUTH_VALIDATE_API, {
      headers: { Authorization: `Bearer ${t}` },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json() as { allowed_uins?: unknown }
    if (!Array.isArray(data.allowed_uins)) return null
    return data.allowed_uins.map((x) => Number(x)).filter((n) => Number.isFinite(n))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
