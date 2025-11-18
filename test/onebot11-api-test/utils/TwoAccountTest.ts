import { AccountManager } from '../core/AccountManager.js';
import { ApiClient, ApiResponse } from '../core/ApiClient.js';
import { EventListener, EventFilter, OB11Event } from '../core/EventListener.js';

/**
 * 双账号测试工具类
 * 提供双账号交互测试的通用方法
 */
export class TwoAccountTest {
  private accountManager: AccountManager;
  public primaryListener: EventListener;
  public secondaryListener: EventListener;

  /**
   * 构造函数
   * @param accountManager 账号管理器实例
   */
  constructor(accountManager: AccountManager) {
    this.accountManager = accountManager;
    this.primaryListener = new EventListener(accountManager.getPrimary());
    this.secondaryListener = new EventListener(accountManager.getSecondary());
  }



  /**
   * 获取账号管理器
   */
  getAccountManager(): AccountManager {
    return this.accountManager;
  }

  /**
   * 获取指定账号的客户端（公开方法）
   */
  getClient(account: 'primary' | 'secondary'): ApiClient {
    return account === 'primary'
      ? this.accountManager.getPrimary()
      : this.accountManager.getSecondary();
  }

  /**
   * 获取指定账号的事件监听器（公开方法）
   */
  getListener(account: 'primary' | 'secondary'): EventListener {
    return account === 'primary' ? this.primaryListener : this.secondaryListener;
  }

  /**
   * 辅助方法：延迟执行（公开方法）
   */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 执行操作并验证结果
   * @param action 要执行的操作（返回 Promise）
   * @param verifier 验证函数（返回 Promise<boolean>）
   * @param timeout 超时时间（毫秒），默认 30000
   * @param retryInterval 重试间隔（毫秒），默认 1000
   * @returns Promise，解析为操作结果和验证结果
   */
  async executeAndVerify(
    action: () => Promise<any>,
    verifier: () => Promise<boolean>,
    timeout: number = 30000,
    retryInterval: number = 1000
  ): Promise<{ actionResult: any; verified: boolean }> {
    // 执行操作
    const actionResult = await action();

    // 开始验证，支持重试
    const startTime = Date.now();
    let verified = false;

    while (Date.now() - startTime < timeout) {
      try {
        verified = await verifier();
        if (verified) {
          break;
        }
      } catch (error) {
        // 验证过程中出错，继续重试
        if (process.env.NODE_ENV !== 'test') {
          console.warn('Verification error:', error);
        }
      }

      // 等待一段时间后重试
      await this.sleep(retryInterval);
    }

    if (!verified) {
      throw new Error(`Verification failed after ${timeout}ms`);
    }

    return { actionResult, verified };
  }

  /**
   * 启动所有事件监听器
   */
  async startAllListeners(): Promise<void> {
    await Promise.all([
      this.primaryListener.startListening(),
      this.secondaryListener.startListening(),
    ]);
  }

  /**
   * 停止所有事件监听器
   */
  stopAllListeners(): void {
    this.primaryListener.stopListening();
    this.secondaryListener.stopListening();
  }

  /**
   * 清空所有事件队列
   */
  clearAllQueues(): void {
    this.primaryListener.clearQueue();
    this.secondaryListener.clearQueue();
  }

  /**
   * 获取主账号监听器
   */
  getPrimaryListener(): EventListener {
    return this.primaryListener;
  }

  /**
   * 获取副账号监听器
   */
  getSecondaryListener(): EventListener {
    return this.secondaryListener;
  }


}
