import fs from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { Config, OB11Config, SatoriConfig, WebUIConfig } from './types'
import { DATA_DIR, selfInfo } from './globalVars'
import { mergeNewProperties } from './utils/misc'
import { fileURLToPath } from 'node:url'
import { defaultConfig } from '@/common/defaultConfig'

export class ConfigUtil {
  private configPath: string | undefined
  private config: Config | null = null
  private watch = false
  private defaultConfigPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'default_config.json')

  constructor(configPath?: string) {
    this.configPath = configPath
  }

  setConfigPath(configPath: string) {
    this.configPath = configPath
  }

  listenChange(cb: (config: Config) => void) {
    console.log('配置文件位于', this.configPath)

    this.setConfig(this.getConfig())
    if (this.configPath) {
      fs.watchFile(this.configPath, { persistent: true, interval: 1000 }, () => {
        if (!this.watch) {
          return
        }
        console.log('配置重載')
        const c = this.reloadConfig()
        cb(c)
      })
    }
  }

  getConfig(cache = true) {
    if (this.config && cache) {
      return this.config
    }

    return this.reloadConfig()
  }

  getDefaultConfig(): Config {
    const _defaultConfig = { ...defaultConfig }
    const defaultConfigFromFile = fs.readFileSync(this.defaultConfigPath, 'utf-8')
    try {
      const parsedDefaultConfig = JSON5.parse(defaultConfigFromFile)
      Object.assign(_defaultConfig, parsedDefaultConfig)
    } catch (e) {
      console.error('解析 default_config.json 错误', e)
    }
    return _defaultConfig
  }

  reloadConfig(): Config {
    if (!this.configPath) {
      return this.getDefaultConfig()
    }
    if (!fs.existsSync(this.configPath)) {
      this.config = this.getDefaultConfig()
      this.setConfig(this.config)
      return this.config
    }
    else {
      const data = fs.readFileSync(this.configPath, 'utf-8')
      let jsonData: Config = defaultConfig
      try {
        jsonData = JSON5.parse(data)
        console.info('配置加载成功')
        mergeNewProperties(defaultConfig, jsonData)
        this.checkOldConfig(jsonData.ob11, jsonData.ob11, 'wsReverseUrls', 'wsHosts')
        this.checkOldConfig(jsonData.ob11, jsonData.ob11, 'httpPostUrls', 'httpHosts')
        this.checkOldConfig(jsonData, jsonData.ob11, 'onlyLocalhost', 'listenLocalhost')
        jsonData.webui = this.migrateWebUIToken(jsonData.webui)
        this.setConfig(jsonData)
        this.config = jsonData
        return this.config
      } catch (e) {
        console.error(`${this.configPath} json 内容不合格`, e)
        this.config = this.getDefaultConfig()
        return this.config
      }
    }
  }

  setConfig(config: Config) {
    this.config = config
    this.writeConfig(config)
  }

  writeConfig(config: Config, watch = false) {
    if (!this.configPath) {
      return
    }
    this.watch = watch
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    setTimeout(() => {
      this.watch = true
    }, 3000)
  }

  private migrateWebUIToken(webuiConfig: WebUIConfig & {token?: string}) {
    if (webuiConfig.token && !webuiTokenUtil.getToken()) {
      webuiTokenUtil.setToken(webuiConfig.token)
      delete webuiConfig['token']
    }
    return webuiConfig
  }

  private checkOldConfig(
    currentConfig: Config | OB11Config | SatoriConfig,
    oldConfig: Config | OB11Config | SatoriConfig,
    currentKey: keyof OB11Config | keyof SatoriConfig | keyof Config,
    oldKey: 'http' | 'hosts' | 'wsPort' | 'wsHosts' | 'reportSelfMessage' | 'httpHosts' | 'token' | 'listenLocalhost',
  ) {
    // 迁移旧的配置到新配置，避免用户重新填写配置
    const oldValue = (oldConfig as any)[oldKey]
    if (oldValue !== undefined) {
      Object.assign(currentConfig, { [currentKey]: oldValue })
      delete (oldConfig as any)[oldKey]
    }
  }
}

let globalConfigUtil: ConfigUtil | null = null

export function getConfigUtil(force = false) {
  const configFilePath = selfInfo.uin ? path.join(DATA_DIR, `config_${selfInfo.uin}.json`) : undefined
  if (!globalConfigUtil || force) {
    globalConfigUtil = new ConfigUtil(configFilePath)
  }
  return globalConfigUtil
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
