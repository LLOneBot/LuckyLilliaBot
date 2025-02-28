import fs from 'node:fs'
import path from 'node:path'
import { Config, OB11Config, SatoriConfig } from './types'
import { selfInfo, DATA_DIR } from './globalVars'
import { mergeNewProperties } from './utils/misc'

export class ConfigUtil {
  private readonly configPath: string
  private config: Config | null = null

  constructor(configPath: string) {
    this.configPath = configPath
  }

  getConfig(cache = true) {
    if (this.config && cache) {
      return this.config
    }

    return this.reloadConfig()
  }

  reloadConfig(): Config {
    const ob11Default: OB11Config = {
      enable: true,
      httpPort: 3000,
      httpHosts: [],
      httpSecret: '',
      wsPort: 3001,
      wsHosts: [],
      enableHttp: true,
      enableHttpPost: true,
      enableWs: true,
      enableWsReverse: false,
      messagePostFormat: 'array',
      enableHttpHeart: false,
      listenLocalhost: false,
      reportSelfMessage: false
    }
    const satoriDefault: SatoriConfig = {
      enable: true,
      port: 5600,
      listen: '0.0.0.0',
      token: ''
    }
    const defaultConfig: Config = {
      enableLLOB: true,
      satori: satoriDefault,
      ob11: ob11Default,
      heartInterval: 60000,
      token: '',
      enableLocalFile2Url: false,
      debug: false,
      log: true,
      autoDeleteFile: false,
      autoDeleteFileSecond: 60,
      musicSignUrl: '',
      msgCacheExpire: 120
    }

    if (!fs.existsSync(this.configPath)) {
      this.config = defaultConfig
      return this.config
    } else {
      const data = fs.readFileSync(this.configPath, 'utf-8')
      let jsonData: Config = defaultConfig
      try {
        jsonData = JSON.parse(data)
      } catch (e) {
        this.config = defaultConfig
        return this.config
      }
      mergeNewProperties(defaultConfig, jsonData)
      this.checkOldConfig(jsonData.ob11, jsonData, 'httpPort', 'http')
      this.checkOldConfig(jsonData.ob11, jsonData, 'httpHosts', 'hosts')
      this.checkOldConfig(jsonData.ob11, jsonData, 'wsPort', 'wsPort')
      this.checkOldConfig(jsonData.ob11, jsonData, 'reportSelfMessage', 'reportSelfMessage')
      this.config = jsonData
      return this.config
    }
  }

  setConfig(config: Config) {
    this.config = config
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  private checkOldConfig(
    currentConfig: OB11Config,
    oldConfig: Config,
    currentKey: 'httpPort' | 'httpHosts' | 'wsPort' | 'reportSelfMessage',
    oldKey: 'http' | 'hosts' | 'wsPort' | 'reportSelfMessage',
  ) {
    // 迁移旧的配置到新配置，避免用户重新填写配置
    const oldValue = oldConfig[oldKey]
    if (oldValue) {
      Object.assign(currentConfig, { [currentKey]: oldValue })
      delete oldConfig[oldKey]
    }
  }
}

export function getConfigUtil() {
  const configFilePath = path.join(DATA_DIR, `config_${selfInfo.uin}.json`)
  return new ConfigUtil(configFilePath)
}
