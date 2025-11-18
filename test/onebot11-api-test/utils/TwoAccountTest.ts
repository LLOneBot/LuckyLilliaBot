import { AccountManager } from '../core/AccountManager.js';
import { ApiClient, ApiResponse } from '../core/ApiClient.js';
import { EventListener, EventFilter, OB11Event } from '../core/EventListener.js';

/**
 * 双账号测试工具类
 * 提供双账号交互测试的通用方法
 */
export class TwoAccountTest {
  private accountManager: AccountManager;
  private primaryListener: EventListener;
  private secondaryListener: EventListener;

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
   * 获取指定账号的客户端
   * @param account 账号标识（'primary' 或 'secondary'）
   * @returns API 客户端实例
   */
  private getClient(account: 'primary' | 'secondary'): ApiClient {
    return account === 'primary'
      ? this.accountManager.getPrimary()
      : this.accountManager.getSecondary();
  }

  /**
   * 获取指定账号的事件监听器
   * @param account 账号标识（'primary' 或 'secondary'）
   * @returns 事件监听器实例
   */
  private getListener(account: 'primary' | 'secondary'): EventListener {
    return account === 'primary' ? this.primaryListener : this.secondaryListener;
  }

  /**
   * 发送消息并验证接收
   * @param from 发送方账号（'primary' 或 'secondary'）
   * @param to 接收方账号（'primary' 或 'secondary'）
   * @param message 消息内容
   * @param messageType 消息类型（'private' 或 'group'）
   * @param targetId 目标 ID（用户 ID 或群 ID）
   * @param timeout 超时时间（毫秒），默认 30000
   * @returns Promise，解析为发送的消息 ID 和接收到的事件
   */
  async sendAndVerifyMessage(
    from: 'primary' | 'secondary',
    to: 'primary' | 'secondary',
    message: string,
    messageType: 'private' | 'group' = 'private',
    targetId?: string,
    timeout: number = 30000
  ): Promise<{ messageId: string; receivedEvent: OB11Event }> {
    const senderClient = this.getClient(from);
    const receiverListener = this.getListener(to);

    // 确保接收方的事件监听器已启动
    if (!receiverListener.isListening()) {
      await receiverListener.startListening();
    }

    // 准备事件过滤器
    const eventFilter: EventFilter = {
      type: `message.${messageType}`,
    };

    // 如果指定了目标 ID，添加到过滤器
    if (targetId) {
      if (messageType === 'private') {
        // 获取发送方的用户 ID
        const senderInfo = await senderClient.call('get_login_info', {});
        eventFilter.userId = String(senderInfo.data.user_id);
      } else if (messageType === 'group') {
        eventFilter.groupId = targetId;
      }
    }

    // 开始等待事件（在发送消息之前设置监听）
    const eventPromise = receiverListener.waitForEvent(eventFilter, timeout);

    // 发送消息
    let sendResponse: ApiResponse;
    if (messageType === 'private') {
      // 获取接收方的用户 ID
      const receiverClient = this.getClient(to);
      const receiverInfo = await receiverClient.call('get_login_info', {});
      const receiverUserId = receiverInfo.data.user_id;

      sendResponse = await senderClient.call('send_private_msg', {
        user_id: receiverUserId,
        message: message,
      });
    } else {
      // 群消息
      if (!targetId) {
        throw new Error('Group ID is required for group messages');
      }

      sendResponse = await senderClient.call('send_group_msg', {
        group_id: targetId,
        message: message,
      });
    }

    // 检查发送是否成功
    if (sendResponse.retcode !== 0) {
      throw new Error(`Failed to send message: ${sendResponse.status}`);
    }

    const messageId = String(sendResponse.data.message_id);

    // 等待接收方收到消息
    const receivedEvent = await eventPromise;

    // 验证消息内容
    const receivedMessage = this.extractMessageContent(receivedEvent);
    if (receivedMessage !== message) {
      throw new Error(
        `Message content mismatch. Expected: "${message}", Received: "${receivedMessage}"`
      );
    }

    return { messageId, receivedEvent };
  }

  /**
   * 从事件中提取消息内容
   * @param event 事件对象
   * @returns 消息内容字符串
   */
  private extractMessageContent(event: OB11Event): string {
    if (typeof event.message === 'string') {
      return event.message;
    } else if (Array.isArray(event.message)) {
      // CQ 码数组格式
      return event.message
        .map((seg: any) => {
          if (seg.type === 'text') {
            return seg.data.text;
          }
          return '';
        })
        .join('');
    } else if (event.raw_message) {
      return event.raw_message;
    }
    return '';
  }

  /**
   * 添加好友并验证
   * @param requester 发起请求的账号（'primary' 或 'secondary'）
   * @param target 目标账号（'primary' 或 'secondary'）
   * @param timeout 超时时间（毫秒），默认 30000
   * @returns Promise，解析为好友请求事件和处理结果
   */
  async addAndVerifyFriend(
    requester: 'primary' | 'secondary',
    target: 'primary' | 'secondary',
    timeout: number = 30000
  ): Promise<{ requestEvent: OB11Event; approved: boolean }> {
    const requesterClient = this.getClient(requester);
    const targetClient = this.getClient(target);
    const targetListener = this.getListener(target);

    // 确保目标账号的事件监听器已启动
    if (!targetListener.isListening()) {
      await targetListener.startListening();
    }

    // 获取请求方的用户 ID
    const requesterInfo = await requesterClient.call('get_login_info', {});
    const requesterUserId = String(requesterInfo.data.user_id);

    // 获取目标方的用户 ID
    const targetInfo = await targetClient.call('get_login_info', {});
    const targetUserId = String(targetInfo.data.user_id);

    // 准备事件过滤器（等待好友请求事件）
    const eventFilter: EventFilter = {
      type: 'request.friend',
      userId: requesterUserId,
    };

    // 开始等待好友请求事件
    const eventPromise = targetListener.waitForEvent(eventFilter, timeout);

    // 发送好友请求（注意：OneBot11 标准中没有直接的添加好友接口）
    // 这里假设通过某种方式触发了好友请求，实际测试中可能需要手动操作或使用扩展接口

    // 等待好友请求事件
    const requestEvent = await eventPromise;

    // 处理好友请求（同意）
    const flag = requestEvent.flag;
    const approveResponse = await targetClient.call('set_friend_add_request', {
      flag: flag,
      approve: true,
    });

    if (approveResponse.retcode !== 0) {
      throw new Error(`Failed to approve friend request: ${approveResponse.status}`);
    }

    // 等待一段时间让好友关系生效
    await this.sleep(2000);

    // 验证好友列表中是否包含对方
    const friendListResponse = await requesterClient.call('get_friend_list', {});
    const friendList = friendListResponse.data;

    const isFriend = friendList.some(
      (friend: any) => String(friend.user_id) === targetUserId
    );

    return { requestEvent, approved: isFriend };
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

  /**
   * 辅助方法：延迟执行
   * @param ms 延迟时间（毫秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
