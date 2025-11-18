import * as fs from 'fs';
import * as path from 'path';

/**
 * 账号配置接口
 */
export interface AccountConfig {
  host: string;
  apiKey: string;
  protocol: 'http' | 'ws';
  user_id: string;
}

/**
 * 测试配置接口
 */
export interface TestConfig {
  accounts: {
    primary: AccountConfig;
    secondary: AccountConfig;
  };
  test_group_id?: string;
  timeout: number;
  retryAttempts: number;
}

/**
 * 配置文件不存在错误
 */
export class ConfigNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Configuration file not found: ${filePath}`);
    this.name = 'ConfigNotFoundError';
  }
}

/**
 * 配置格式错误
 */
export class ConfigFormatError extends Error {
  constructor(message: string, cause?: Error) {
    super(`Configuration format error: ${message}`);
    this.name = 'ConfigFormatError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(missingFields: string[]) {
    super(`Configuration validation error. Missing required fields: ${missingFields.join(', ')}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 配置加载器
 */
export class ConfigLoader {
  /**
   * 从指定路径加载配置文件
   * @param configPath 配置文件路径
   * @returns 解析后的测试配置
   * @throws {ConfigNotFoundError} 配置文件不存在
   * @throws {ConfigFormatError} 配置文件格式错误
   * @throws {ConfigValidationError} 配置文件缺少必需字段
   */
  static load(configPath: string): TestConfig {
    // 检查文件是否存在
    if (!fs.existsSync(configPath)) {
      throw new ConfigNotFoundError(configPath);
    }

    // 读取并解析 JSON
    let config: any;
    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(fileContent);
    } catch (error) {
      throw new ConfigFormatError(
        `Failed to parse JSON from ${configPath}`,
        error as Error
      );
    }

    // 验证配置
    this.validate(config);

    return config as TestConfig;
  }

  /**
   * 验证配置对象是否包含所有必需字段
   * @param config 待验证的配置对象
   * @throws {ConfigValidationError} 缺少必需字段
   */
  private static validate(config: any): void {
    const missingFields: string[] = [];

    // 检查顶层字段
    if (!config.accounts) {
      missingFields.push('accounts');
    }
    if (config.timeout === undefined) {
      missingFields.push('timeout');
    }
    if (config.retryAttempts === undefined) {
      missingFields.push('retryAttempts');
    }

    // 检查 accounts 字段
    if (config.accounts) {
      if (!config.accounts.primary) {
        missingFields.push('accounts.primary');
      } else {
        this.validateAccountConfig(config.accounts.primary, 'accounts.primary', missingFields);
      }

      if (!config.accounts.secondary) {
        missingFields.push('accounts.secondary');
      } else {
        this.validateAccountConfig(config.accounts.secondary, 'accounts.secondary', missingFields);
      }
    }

    // 如果有缺失字段，抛出错误
    if (missingFields.length > 0) {
      throw new ConfigValidationError(missingFields);
    }

    // 验证协议值
    if (config.accounts?.primary?.protocol && 
        !['http', 'ws'].includes(config.accounts.primary.protocol)) {
      throw new ConfigFormatError(
        `Invalid protocol for primary account: ${config.accounts.primary.protocol}. Must be 'http' or 'ws'`
      );
    }

    if (config.accounts?.secondary?.protocol && 
        !['http', 'ws'].includes(config.accounts.secondary.protocol)) {
      throw new ConfigFormatError(
        `Invalid protocol for secondary account: ${config.accounts.secondary.protocol}. Must be 'http' or 'ws'`
      );
    }
  }

  /**
   * 验证单个账号配置
   * @param accountConfig 账号配置对象
   * @param prefix 字段前缀（用于错误消息）
   * @param missingFields 缺失字段数组
   */
  private static validateAccountConfig(
    accountConfig: any,
    prefix: string,
    missingFields: string[]
  ): void {
    if (!accountConfig.host) {
      missingFields.push(`${prefix}.host`);
    }
    if (!accountConfig.apiKey) {
      missingFields.push(`${prefix}.apiKey`);
    }
    if (!accountConfig.protocol) {
      missingFields.push(`${prefix}.protocol`);
    }
    if (!accountConfig.user_id) {
      missingFields.push(`${prefix}.user_id`);
    }
  }
}
