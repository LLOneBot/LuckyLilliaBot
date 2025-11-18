/**
 * 消息测试共享设置
 * 提供统一的测试初始化和清理逻辑
 */

import { ConfigLoader } from '../../config/ConfigLoader.js';
import { AccountManager } from '../../core/AccountManager.js';
import { TwoAccountTest } from '../../utils/TwoAccountTest.js';

/**
 * 测试上下文接口
 */
export interface MessageTestContext {
  accountManager: AccountManager;
  twoAccountTest: TwoAccountTest;
  testTimeout: number;
  testGroupId?: string;
  primaryUserId: string;
  secondaryUserId: string;
}

/**
 * 设置消息测试环境
 * @returns 测试上下文对象
 */
export async function setupMessageTest(): Promise<MessageTestContext> {
  const config = ConfigLoader.load('./config/test.config.json');
  const testTimeout = config.timeout || 30000;
  const accountManager = new AccountManager(config);
  const twoAccountTest = new TwoAccountTest(accountManager);

  // 启动事件监听器
  await twoAccountTest.startAllListeners();

  // 从配置中获取用户 ID
  const primaryUserId = config.accounts.primary.user_id;
  const secondaryUserId = config.accounts.secondary.user_id;

  // 从配置中获取测试群组 ID（可选）
  const testGroupId = config.test_group_id;

  return {
    accountManager,
    twoAccountTest,
    testTimeout,
    testGroupId,
    primaryUserId,
    secondaryUserId,
  };
}

/**
 * 清理消息测试环境
 * @param context 测试上下文对象
 */
export function teardownMessageTest(context: MessageTestContext): void {
  context.twoAccountTest.stopAllListeners();
}

/**
 * 清空事件队列
 * @param context 测试上下文对象
 */
export function clearQueues(context: MessageTestContext): void {
  context.twoAccountTest.clearAllQueues();
}

/**
 * 延迟执行辅助函数
 * @param ms 延迟时间（毫秒）
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
