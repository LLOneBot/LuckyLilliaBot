import * as fs from 'fs'
import { AccountConnectionConfig } from './interfaces.js'

/**
 * 测试主配置：双账号 + 测试群 ID + 全局超时
 */
export interface TestConfig {
  accounts: {
    primary: AccountConnectionConfig
    secondary: AccountConnectionConfig
  }
  test_group_id: string
  timeout: number
  retryAttempts: number
}

export class ConfigNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Configuration file not found: ${filePath}`)
    this.name = 'ConfigNotFoundError'
  }
}

export class ConfigFormatError extends Error {
  constructor(message: string, cause?: Error) {
    super(`Configuration format error: ${message}`)
    this.name = 'ConfigFormatError'
    if (cause) this.cause = cause
  }
}

export class ConfigValidationError extends Error {
  constructor(missingFields: string[]) {
    super(`Configuration validation error. Missing required fields: ${missingFields.join(', ')}`)
    this.name = 'ConfigValidationError'
  }
}

/** 读取 + 校验测试配置文件 */
export class ConfigLoader {
  static load(configPath: string): TestConfig {
    if (!fs.existsSync(configPath)) {
      throw new ConfigNotFoundError(configPath)
    }
    let config: any
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch (error) {
      throw new ConfigFormatError(`Failed to parse JSON from ${configPath}`, error as Error)
    }
    this.validate(config)
    return config as TestConfig
  }

  private static validate(config: any): void {
    const missing: string[] = []
    if (!config.accounts) missing.push('accounts')
    if (!config.test_group_id) missing.push('test_group_id')
    if (config.timeout === undefined) missing.push('timeout')
    if (config.retryAttempts === undefined) missing.push('retryAttempts')

    if (config.accounts) {
      if (!config.accounts.primary) missing.push('accounts.primary')
      else this.validateAccount(config.accounts.primary, 'accounts.primary', missing)
      if (!config.accounts.secondary) missing.push('accounts.secondary')
      else this.validateAccount(config.accounts.secondary, 'accounts.secondary', missing)
    }

    if (missing.length > 0) {
      throw new ConfigValidationError(missing)
    }
  }

  private static validateAccount(account: any, prefix: string, missing: string[]): void {
    if (!account.host) missing.push(`${prefix}.host`)
    if (!account.protocol) missing.push(`${prefix}.protocol`)
    if (!account.user_id) missing.push(`${prefix}.user_id`)
    // apiKey 允许为空（无鉴权场景）
  }
}
