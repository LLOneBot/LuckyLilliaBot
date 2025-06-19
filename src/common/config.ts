import fs from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { Config, OB11Config, SatoriConfig, WebUIConfig } from './types'
import { DATA_DIR, selfInfo } from './globalVars'
import { mergeNewProperties } from './utils/misc'
import { fileURLToPath } from 'node:url'

export class ConfigUtil {
  private readonly configPath: string
  private config: Config | null = null

  constructor(configPath: string) {
    this.configPath = configPath
  }

  listenChange(cb: (config: Config) => void) {
    console.log('配置文件位于', this.configPath)
    this.setConfig(this.getConfig())
    fs.watchFile(this.configPath, { persistent: true, interval: 1000 }, () => {
      console.log('配置重載')
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
      enableWsReverse: true,
      messagePostFormat: 'array',
      enableHttpHeart: false,
      reportSelfMessage: false
    }
    const satoriDefault: SatoriConfig = {
      enable: false,
      port: 5600,
      token: ''
    }
    const webuiDefault: WebUIConfig = {
      enable: true,
      port: 3080,
      token: ''
    }
    const defaultConfig: Config = {
      webui: webuiDefault,
      onlyLocalhost: true,
      satori: satoriDefault,
      ob11: ob11Default,
      heartInterval: 60000,
      enableLocalFile2Url: false,
      debug: false,
      log: true,
      autoDeleteFile: false,
      autoDeleteFileSecond: 60,
      musicSignUrl: 'https://llob.linyuchen.net/sign/music',
      msgCacheExpire: 120,
      ffmpeg: ''
    }
    // console.info('读取配置文件', this.configPath)
    if (!fs.existsSync(this.configPath)) {
      const defaultConfigPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'default_config.json')
      const defaultConfigData = fs.readFileSync(defaultConfigPath, 'utf-8')
      try{
        this.config = JSON5.parse(defaultConfigData)
      }
      catch (e) {
        console.error('默认配置文件内容不合格，使用内置默认配置')
        this.config = defaultConfig
      }
      return this.config!
    } else {
      const data = fs.readFileSync(this.configPath, 'utf-8')
      let jsonData: Config = defaultConfig
      try {
        jsonData = JSON5.parse(data)
        console.info('配置加载成功')
      } catch (e) {
        console.error(`${this.configPath} json 内容不合格`, e)
        this.config = defaultConfig
        return this.config
      }
      mergeNewProperties(defaultConfig, jsonData)
      this.checkOldConfig(jsonData.ob11, jsonData.ob11, 'wsReverseUrls', 'wsHosts')
      this.checkOldConfig(jsonData.ob11, jsonData.ob11, 'httpPostUrls', 'httpHosts')
      this.checkOldConfig(jsonData, jsonData.ob11, 'onlyLocalhost', 'listenLocalhost')
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

export function getConfigUtil() {
  const configFilePath = path.join(DATA_DIR, `config_${selfInfo.uin}.json`)
  return new ConfigUtil(configFilePath)
}
