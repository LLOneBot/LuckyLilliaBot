/**
 * OB11 测试的 ConfigLoader 是 framework `ConfigLoader` 的薄封装：
 * 把 framework 通用的 AccountConnectionConfig 收紧成 OB11 自己的 AccountConfig
 * （protocol: 'http' | 'ws'），使老代码 import 不变。
 *
 * 加载优先级:
 *   1. 显式传入的 configPath (老 OB11 格式 config/test.config.json) 存在则用它
 *   2. fallback 到项目级 test/test.config.json (统一 schema, 用 UnifiedConfigLoader.forOB11 翻译)
 */
import * as fs from 'fs'
import {
  ConfigLoader as FrameworkConfigLoader,
  TestConfig as FrameworkTestConfig,
  AccountConnectionConfig,
  ConfigNotFoundError,
  ConfigFormatError,
  ConfigValidationError,
  UnifiedConfigLoader,
} from '../../test-framework/src/index.js'

export { ConfigNotFoundError, ConfigFormatError, ConfigValidationError }

/** OB11 账号配置：把 framework 的 protocol 收紧到 'http' | 'ws' */
export interface AccountConfig extends AccountConnectionConfig {
  protocol: 'http' | 'ws'
  apiKey: string
}

/** OB11 测试配置 */
export interface TestConfig extends FrameworkTestConfig {
  accounts: {
    primary: AccountConfig
    secondary: AccountConfig
  }
}

export class ConfigLoader {
  /** 加载 + 校验 OB11 测试配置文件。
   *  configPath 存在则用它（向后兼容 OB11 老 config）；不存在则 fallback 项目级 test/test.config.json */
  static load(configPath: string): TestConfig {
    let cfg: TestConfig
    if (fs.existsSync(configPath)) {
      cfg = FrameworkConfigLoader.load(configPath) as TestConfig
    } else {
      const { config: unified } = UnifiedConfigLoader.loadUnified()
      cfg = UnifiedConfigLoader.forOB11(unified) as TestConfig
    }
    // 校验 protocol 取值（framework 不约束，OB11 这里限定）
    const validateProtocol = (p: string, prefix: string) => {
      if (!['http', 'ws'].includes(p)) {
        throw new ConfigFormatError(`Invalid protocol for ${prefix}: ${p}. Must be 'http' or 'ws'`)
      }
    }
    validateProtocol(cfg.accounts.primary.protocol, 'primary account')
    validateProtocol(cfg.accounts.secondary.protocol, 'secondary account')
    return cfg
  }
}
