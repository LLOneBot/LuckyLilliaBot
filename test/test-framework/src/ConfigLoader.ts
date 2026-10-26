import * as fs from 'fs'
import * as path from 'path'
import { AccountConnectionConfig } from './interfaces.js'

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

// test/test.config.json: 所有套件共用的统一配置

/** 一个 bot 在各协议下的入口, 只填实际开了的协议 */
export interface UnifiedBotConfig {
  uin: string

  /** 例 "http://127.0.0.1:53000" */
  ob11_http?: string
  /** 例 "ws://127.0.0.1:3001" */
  ob11_ws?: string
  ob11_token?: string

  milky_http?: string
  milky_token?: string

  satori_http?: string
  satori_token?: string

  /** 例 "http://127.0.0.1:13080"; 密码固定从 data/webui_token.txt 读 */
  webui_http?: string
}

export interface UnifiedTestConfig {
  bots: {
    primary: UnifiedBotConfig
    secondary?: UnifiedBotConfig
  }
  /** primary 和 secondary 都要在群里 */
  test_group_id: string
  /** 单测超时 (ms) */
  timeout?: number
  retryAttempts?: number
}

/** 单 bot, 直接打 WebUI */
export interface WebQQSuiteConfig {
  host: string
  password: string
  user_id: string
  test_group_id: string
  /** 查用户详情用的 uin, 默认 secondary.uin, 没有就用 primary.uin */
  test_user_id: string
  timeout: number
}

/** 各套件用 loadUnified() 找到 test/test.config.json, 再用对应的 forXxx() 转成自己的配置 */
export class UnifiedConfigLoader {
  /** 从 startDir 往上找 test/test.config.json */
  static defaultPath(startDir: string = process.cwd()): string {
    let dir = path.resolve(startDir)
    while (true) {
      const candidate = path.join(dir, 'test', 'test.config.json')
      if (fs.existsSync(candidate)) return candidate
      // 当前 dir 自己可能就是 test/
      if (path.basename(dir) === 'test') {
        const sibling = path.join(dir, 'test.config.json')
        if (fs.existsSync(sibling)) return sibling
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // 找不到也返回一个路径, 让 loadUnified 报 NotFound
    return path.resolve(startDir, '../test.config.json')
  }

  static loadUnified(configPath?: string): { config: UnifiedTestConfig; configPath: string } {
    const finalPath = configPath ?? this.defaultPath()
    if (!fs.existsSync(finalPath)) {
      throw new ConfigNotFoundError(finalPath)
    }
    let raw: any
    try {
      raw = JSON.parse(fs.readFileSync(finalPath, 'utf-8'))
    } catch (e) {
      throw new ConfigFormatError(`Failed to parse JSON from ${finalPath}`, e as Error)
    }
    this.validateUnified(raw)
    return { config: raw as UnifiedTestConfig, configPath: finalPath }
  }

  private static validateUnified(c: any): void {
    const missing: string[] = []
    if (!c.bots) missing.push('bots')
    else {
      if (!c.bots.primary) missing.push('bots.primary')
      else if (!c.bots.primary.uin) missing.push('bots.primary.uin')
      if (c.bots.secondary && !c.bots.secondary.uin) missing.push('bots.secondary.uin')
    }
    if (!c.test_group_id) missing.push('test_group_id')
    if (missing.length > 0) throw new ConfigValidationError(missing)
  }

  static forOB11(unified: UnifiedTestConfig): TestConfig {
    return this.forDoubleAccount(unified, 'ob11')
  }
  static forMilky(unified: UnifiedTestConfig): TestConfig {
    return this.forDoubleAccount(unified, 'milky')
  }
  static forSatori(unified: UnifiedTestConfig): TestConfig {
    return this.forDoubleAccount(unified, 'satori')
  }

  private static forDoubleAccount(unified: UnifiedTestConfig, suite: 'ob11' | 'milky' | 'satori'): TestConfig {
    if (!unified.bots.secondary) {
      throw new ConfigValidationError([`bots.secondary (${suite} 套件需要双账号)`])
    }
    return {
      accounts: {
        primary: this.toLegacyAccount(unified.bots.primary, suite, 'primary'),
        secondary: this.toLegacyAccount(unified.bots.secondary, suite, 'secondary'),
      },
      test_group_id: unified.test_group_id,
      timeout: unified.timeout ?? 30000,
      retryAttempts: unified.retryAttempts ?? 3,
    }
  }

  private static toLegacyAccount(
    bot: UnifiedBotConfig,
    suite: 'ob11' | 'milky' | 'satori',
    label: string,
  ): AccountConnectionConfig {
    let host: string | undefined
    let protocol: string = 'http'
    let token: string | undefined

    if (suite === 'ob11') {
      host = bot.ob11_http ?? bot.ob11_ws
      protocol = bot.ob11_http ? 'http' : (bot.ob11_ws ? 'ws' : 'http')
      token = bot.ob11_token
    } else if (suite === 'milky') {
      host = bot.milky_http
      protocol = 'http'
      token = bot.milky_token
    } else {
      host = bot.satori_http
      protocol = 'http'
      token = bot.satori_token
    }

    if (!host) {
      throw new ConfigValidationError([`bots.${label}.${suite}_http (suite=${suite})`])
    }
    return {
      host,
      protocol,
      user_id: bot.uin,
      apiKey: token ?? '',
    }
  }

  /** 测 primary; 密码从 data/webui_token.txt 读 (相对 test.config.json 是 ../data/webui_token.txt) */
  static forWebQQ(unified: UnifiedTestConfig, configFilePath: string): WebQQSuiteConfig {
    const bot = unified.bots.primary
    if (!bot.webui_http) {
      throw new ConfigValidationError(['bots.primary.webui_http (WebQQ 套件需要)'])
    }
    const passwordPath = path.resolve(path.dirname(configFilePath), '../data/webui_token.txt')
    if (!fs.existsSync(passwordPath)) {
      throw new ConfigValidationError([`webui_token: 找不到 ${passwordPath} (bot 还没设过 webui 密码？)`])
    }
    const password = fs.readFileSync(passwordPath, 'utf-8').trim()
    if (!password) throw new ConfigValidationError([`webui_token: ${passwordPath} 为空`])

    return {
      host: bot.webui_http,
      password,
      user_id: bot.uin,
      test_group_id: unified.test_group_id,
      test_user_id: unified.bots.secondary?.uin ?? bot.uin,
      timeout: unified.timeout ?? 30000,
    }
  }
}

