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
  static inject = ['logger']

  private configPath: string | undefined
  private config: LLBotConfig | null = null
  private watch = false
  private defaultConfigPath = path.join(import.meta.dirname, 'default_config.json')
  private logger

  constructor(ctx: Context) {
    super(ctx, 'config')
    this.logger = ctx.logger('config')
  }

  listenChange(cb: (config: LLBotConfig) => void) {
    this.logger.info('配置文件位于', this.configPath)

    // 初始化时不写入文件，只加载配置
    this.config = this.get()
    if (this.configPath) {
      fs.watchFile(this.configPath, { persistent: true, interval: 1000 }, () => {
        if (!this.watch) {
          return
        }
        this.logger.info('配置重載')
        const c = this.reloadConfig()
        cb(c)
      })
      setTimeout(() => this.watch = true, 1500)
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
    // 暂时关闭监听，避免触发自己写入的变化
    this.watch = false
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    // 延迟重新启用监听
    setTimeout(() => {
      this.watch = true
    }, 1500)
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
