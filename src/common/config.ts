import fs from 'node:fs'
import { Config, OB11Config } from './types'
import path from 'node:path'
import { selfInfo, DATA_DIR } from './globalVars'

// 在保证老对象已有的属性不变化的情况下将新对象的属性复制到老对象
function mergeNewProperties(newObj: any, oldObj: any) {
  Object.keys(newObj).forEach((key) => {
    // 如果老对象不存在当前属性，则直接复制
    if (!oldObj.hasOwnProperty(key)) {
      oldObj[key] = newObj[key]
    } else {
      // 如果老对象和新对象的当前属性都是对象，则递归合并
      if (typeof oldObj[key] === 'object' && typeof newObj[key] === 'object') {
        mergeNewProperties(newObj[key], oldObj[key])
      } else if (typeof oldObj[key] === 'object' || typeof newObj[key] === 'object') {
        // 属性冲突，有一方不是对象，直接覆盖
        oldObj[key] = newObj[key]
      }
    }
  })
}

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
      enableQOAutoQuote: false
    }
    const defaultConfig: Config = {
      enableLLOB: true,
      ob11: ob11Default,
      heartInterval: 60000,
      token: '',
      enableLocalFile2Url: false,
      debug: false,
      log: false,
      reportSelfMessage: false,
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
    currentKey: 'httpPort' | 'httpHosts' | 'wsPort',
    oldKey: 'http' | 'hosts' | 'wsPort',
  ) {
    // 迁移旧的配置到新配置，避免用户重新填写配置
    const oldValue = oldConfig[oldKey]
    if (oldValue) {
      currentConfig[currentKey] = oldValue as any
      delete oldConfig[oldKey]
    }
  }
}

export function getConfigUtil() {
  const configFilePath = path.join(DATA_DIR, `config_${selfInfo.uin}.json`)
  return new ConfigUtil(configFilePath)
}
