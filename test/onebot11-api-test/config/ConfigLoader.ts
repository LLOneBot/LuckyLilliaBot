/**
 * OB11 测试的 ConfigLoader 是 framework `ConfigLoader` 的薄封装：
 * 把 framework 通用的 AccountConnectionConfig 收紧成 OB11 自己的 AccountConfig
 * （protocol: 'http' | 'ws'），使老代码 import 不变。
 */
import {
  ConfigLoader as FrameworkConfigLoader,
  TestConfig as FrameworkTestConfig,
  AccountConnectionConfig,
  ConfigNotFoundError,
  ConfigFormatError,
  ConfigValidationError,
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
  /** 加载 + 校验 OB11 测试配置文件 */
  static load(configPath: string): TestConfig {
    const cfg = FrameworkConfigLoader.load(configPath) as TestConfig
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
