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

  listenChange(cb: (config: Config) => void) {
    this.setConfig(this.getConfig())
    fs.watchFile(this.configPath, { persistent: true, interval: 1000 }, () => {
      const c = this.reloadConfig()
      cb(c)
    })
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
      token: '',
      httpPort: 3000,
      httpPostUrls: [],
      httpSecret: '',
      wsPort: 3001,
      wsReverseUrls: [],
      enableHttp: true,
      enableHttpPost: true,
      enableWs: true,
      enableWsReverse: false,
      messagePostFormat: 'array',
      enableHttpHeart: false,
      listenLocalhost: true,
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
      enableLocalFile2Url: false,
      debug: false,
      log: true,
      autoDeleteFile: false,
      autoDeleteFileSecond: 60,
      musicSignUrl: 'https://llob.linyuchen.net/sign/music',
      msgCacheExpire: 120
    }
    console.info('读取配置文件', this.configPath)
    if (!fs.existsSync(this.configPath)) {
      this.config = defaultConfig
      return this.config
    } else {
      const data = fs.readFileSync(this.configPath, 'utf-8')
      let jsonData: Config = defaultConfig
      try {
        jsonData = JSON.parse(data)
      } catch (e) {
        console.error(`${this.configPath} json 内容不合格`)
        this.config = defaultConfig
        return this.config
      }
      mergeNewProperties(defaultConfig, jsonData)
      this.checkOldConfig(jsonData.ob11, jsonData, 'httpPort', 'http')
      this.checkOldConfig(jsonData.ob11, jsonData, 'httpPostUrls', 'hosts')
      this.checkOldConfig(jsonData.ob11, jsonData, 'wsPort', 'wsPort')
      this.checkOldConfig(jsonData.ob11, jsonData, 'reportSelfMessage', 'reportSelfMessage')
      this.checkOldConfig(jsonData.ob11, jsonData, 'token', 'token')
      this.checkOldConfig(jsonData.ob11, jsonData.ob11, 'wsReverseUrls', 'wsHosts')
      this.checkOldConfig(jsonData.ob11, jsonData.ob11, 'httpPostUrls', 'httpHosts')
      this.config = jsonData
      return this.config
    }
  }

  setConfig(config: Config) {
    this.config = config
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  private checkOldConfig(
    currentConfig: Config | OB11Config | SatoriConfig,
    oldConfig: Config | OB11Config | SatoriConfig,
    currentKey: keyof OB11Config | keyof SatoriConfig | keyof Config,
    oldKey: 'http' | 'hosts' | 'wsPort' | 'wsHosts' | 'reportSelfMessage' | 'httpHosts' | 'token',
  ) {
    // 迁移旧的配置到新配置，避免用户重新填写配置
    const oldValue = (oldConfig as any)[oldKey]
    if (oldValue !== undefined) {
      Object.assign(currentConfig, { [currentKey]: oldValue })
      delete (oldConfig as any)[oldKey]
    }
  }
}

export function getConfigUtil() {
  const configFilePath = path.join(DATA_DIR, `config_${selfInfo.uin}.json`)
  return new ConfigUtil(configFilePath)
}
