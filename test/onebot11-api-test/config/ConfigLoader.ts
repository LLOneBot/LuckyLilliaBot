// 包一层 framework 的 ConfigLoader, protocol 收紧成 'http' | 'ws'。传入的旧格式 config 存在就用它,
// 否则用 test/test.config.json
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

export interface AccountConfig extends AccountConnectionConfig {
  protocol: 'http' | 'ws'
  apiKey: string
}

export interface TestConfig extends FrameworkTestConfig {
  accounts: {
    primary: AccountConfig
    secondary: AccountConfig
  }
}

export class ConfigLoader {
  static load(configPath: string): TestConfig {
    let cfg: TestConfig
    if (fs.existsSync(configPath)) {
      cfg = FrameworkConfigLoader.load(configPath) as TestConfig
    } else {
      const { config: unified } = UnifiedConfigLoader.loadUnified()
      cfg = UnifiedConfigLoader.forOB11(unified) as TestConfig
    }
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
