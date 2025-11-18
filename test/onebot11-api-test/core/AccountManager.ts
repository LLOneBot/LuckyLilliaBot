import { ApiClient } from './ApiClient.js';
import { TestConfig } from '../config/ConfigLoader.js';

/**
 * 账号管理器
 * 管理主账号和副账号的 ApiClient 实例
 */
export class AccountManager {
  private primaryClient: ApiClient;
  private secondaryClient: ApiClient;

  /**
   * 构造函数
   * @param config 测试配置
   */
  constructor(config: TestConfig) {
    // 创建主账号客户端
    this.primaryClient = new ApiClient(
      config.accounts.primary,
      config.retryAttempts
    );

    // 创建副账号客户端
    this.secondaryClient = new ApiClient(
      config.accounts.secondary,
      config.retryAttempts
    );
  }

  /**
   * 获取主账号客户端
   * @returns 主账号的 ApiClient 实例
   */
  getPrimary(): ApiClient {
    return this.primaryClient;
  }

  /**
   * 获取副账号客户端
   * @returns 副账号的 ApiClient 实例
   */
  getSecondary(): ApiClient {
    return this.secondaryClient;
  }

  /**
   * 断开所有 WebSocket 连接
   */
  disconnectAll(): void {
    this.primaryClient.disconnectWs();
    this.secondaryClient.disconnectWs();
  }
}
