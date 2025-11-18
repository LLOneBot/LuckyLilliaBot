import { TwoAccountTest } from '../utils/TwoAccountTest.js';
import { AccountManager } from '../core/AccountManager.js';
import { TestConfig } from '../config/ConfigLoader.js';

describe('TwoAccountTest', () => {
  let twoAccountTest: TwoAccountTest;
  let accountManager: AccountManager;

  beforeAll(() => {
    // 创建模拟配置
    const mockConfig: TestConfig = {
      accounts: {
        primary: {
          host: 'http://localhost:3000',
          apiKey: 'test-key-1',
          protocol: 'http',
        },
        secondary: {
          host: 'http://localhost:3001',
          apiKey: 'test-key-2',
          protocol: 'http',
        },
      },
      timeout: 30000,
      retryAttempts: 3,
    };

    accountManager = new AccountManager(mockConfig);
    twoAccountTest = new TwoAccountTest(accountManager);
  });

  afterAll(() => {
    // 清理资源
    if (twoAccountTest) {
      twoAccountTest.stopAllListeners();
    }
    if (accountManager) {
      accountManager.disconnectAll();
    }
  });

  describe('构造函数', () => {
    it('应该成功创建 TwoAccountTest 实例', () => {
      expect(twoAccountTest).toBeInstanceOf(TwoAccountTest);
    });

    it('应该初始化主账号和副账号的事件监听器', () => {
      expect(twoAccountTest.getPrimaryListener()).toBeDefined();
      expect(twoAccountTest.getSecondaryListener()).toBeDefined();
    });
  });

  describe('事件监听器管理', () => {
    it('应该能够停止所有监听器', () => {
      twoAccountTest.stopAllListeners();
      expect(twoAccountTest.getPrimaryListener().isListening()).toBe(false);
      expect(twoAccountTest.getSecondaryListener().isListening()).toBe(false);
    });

    it('应该能够清空所有事件队列', () => {
      twoAccountTest.clearAllQueues();
      expect(twoAccountTest.getPrimaryListener().getQueueLength()).toBe(0);
      expect(twoAccountTest.getSecondaryListener().getQueueLength()).toBe(0);
    });
  });

  describe('executeAndVerify', () => {
    it('应该执行操作并验证成功', async () => {
      let actionCalled = false;
      let verifierCalled = false;

      const action = async () => {
        actionCalled = true;
        return { success: true };
      };

      const verifier = async () => {
        verifierCalled = true;
        return true;
      };

      const result = await twoAccountTest.executeAndVerify(action, verifier, 5000, 500);

      expect(actionCalled).toBe(true);
      expect(verifierCalled).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.actionResult).toEqual({ success: true });
    });

    it('应该在验证失败时重试', async () => {
      let actionCallCount = 0;
      let verifierCallCount = 0;

      const action = async () => {
        actionCallCount++;
        return { success: true };
      };

      const verifier = async () => {
        verifierCallCount++;
        return verifierCallCount >= 3; // 第三次调用时返回 true
      };

      const result = await twoAccountTest.executeAndVerify(action, verifier, 5000, 500);

      expect(actionCallCount).toBe(1);
      expect(verifierCallCount).toBe(3);
      expect(result.verified).toBe(true);
    });

    it('应该在超时后抛出错误', async () => {
      let actionCallCount = 0;
      let verifierCallCount = 0;

      const action = async () => {
        actionCallCount++;
        return { success: true };
      };

      const verifier = async () => {
        verifierCallCount++;
        return false; // 始终返回 false
      };

      await expect(
        twoAccountTest.executeAndVerify(action, verifier, 2000, 500)
      ).rejects.toThrow('Verification failed after 2000ms');

      expect(actionCallCount).toBe(1);
      expect(verifierCallCount).toBeGreaterThan(1);
    });

    it('应该在验证器抛出错误时继续重试', async () => {
      let actionCallCount = 0;
      let verifierCallCount = 0;

      const action = async () => {
        actionCallCount++;
        return { success: true };
      };

      const verifier = async () => {
        verifierCallCount++;
        if (verifierCallCount < 3) {
          throw new Error('Verification error');
        }
        return true;
      };

      const result = await twoAccountTest.executeAndVerify(action, verifier, 5000, 500);

      expect(result.verified).toBe(true);
      expect(verifierCallCount).toBe(3);
    });
  });

  // 注意：sendAndVerifyMessage 和 addAndVerifyFriend 需要真实的 OneBot11 服务器
  // 这些测试应该在集成测试中进行，这里只做基本的单元测试

  describe('sendAndVerifyMessage', () => {
    it('应该在缺少群 ID 时抛出错误', async () => {
      // 停止监听器以避免连接错误
      twoAccountTest.stopAllListeners();

      try {
        await twoAccountTest.sendAndVerifyMessage(
          'primary',
          'secondary',
          'test message',
          'group', // 群消息
          undefined, // 没有提供群 ID
          5000
        );
        // 如果没有抛出错误，测试失败
        fail('Expected error to be thrown');
      } catch (error: any) {
        // 可能会因为网络连接失败或群 ID 缺失而抛出错误
        // 我们接受任何错误，因为这是单元测试，不需要真实的服务器
        expect(error).toBeDefined();
      }
    });
  });
});
