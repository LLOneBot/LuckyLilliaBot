import WebSocket from 'ws';
import { ApiClient, TimeoutError } from './ApiClient.js';

/**
 * 事件过滤器接口
 */
export interface EventFilter {
  type?: string;
  userId?: string;
  groupId?: string;
  messageId?: string;
  [key: string]: any; // 支持其他自定义过滤条件
}

/**
 * OneBot11 事件接口
 */
export interface OB11Event {
  time: number;
  self_id: number;
  post_type: string;
  [key: string]: any;
}

/**
 * 事件监听器
 * 监听 WebSocket 事件并支持事件过滤和超时机制
 */
export class EventListener {
  private client: ApiClient;
  private ws: WebSocket | null = null;
  private listening: boolean = false;
  private eventQueue: OB11Event[] = [];
  private eventHandlers: Array<{
    filter: EventFilter;
    resolve: (event: OB11Event) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  /**
   * 构造函数
   * @param client API 客户端实例
   */
  constructor(client: ApiClient) {
    this.client = client;
  }

  /**
   * 开始监听事件
   * 建立 WebSocket 连接并开始接收事件
   */
  async startListening(): Promise<void> {
    if (this.listening) {
      return;
    }

    // 获取客户端配置
    const config = this.client.getConfig();

    // 将 http:// 或 https:// 转换为 ws:// 或 wss://
    let wsUrl = config.host;
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = 'ws://' + wsUrl;
    }

    // 添加事件监听路径（如果需要）
    // 某些 OneBot 实现可能需要特定的路径来接收事件
    if (!wsUrl.includes('/event')) {
      wsUrl = wsUrl + '/event';
    }

    return new Promise((resolve, reject) => {
      try {
        // 创建 WebSocket 连接
        const headers: any = {};
        if (config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        this.ws = new WebSocket(wsUrl, { headers });

        // 连接成功
        this.ws.on('open', () => {
          this.listening = true;
          if (process.env.NODE_ENV !== 'test') {
            console.log(`EventListener connected to ${wsUrl}`);
          }
          resolve();
        });

        // 接收消息（事件）
        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const event = JSON.parse(data.toString()) as OB11Event;
            this.handleEvent(event);
          } catch (error) {
            console.error('Failed to parse event:', error);
          }
        });

        // 连接错误
        this.ws.on('error', (error: Error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('EventListener WebSocket error:', error);
          }
          this.listening = false;
          reject(error);
        });

        // 连接关闭
        this.ws.on('close', () => {
          if (process.env.NODE_ENV !== 'test') {
            console.log('EventListener WebSocket connection closed');
          }
          this.listening = false;
          this.ws = null;

          // 清理所有待处理的事件处理器
          this.eventHandlers.forEach((handler) => {
            clearTimeout(handler.timeout);
            handler.reject(new Error('EventListener connection closed'));
          });
          this.eventHandlers = [];
        });

        // 连接超时
        setTimeout(() => {
          if (!this.listening && this.ws) {
            this.ws.terminate();
            reject(new TimeoutError('EventListener connection timeout', 10000));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止监听事件
   * 关闭 WebSocket 连接
   */
  stopListening(): void {
    if (this.ws) {
      // 清理所有待处理的事件处理器
      this.eventHandlers.forEach((handler) => {
        clearTimeout(handler.timeout);
        handler.reject(new Error('EventListener stopped'));
      });
      this.eventHandlers = [];

      // 清空事件队列
      this.eventQueue = [];

      // 关闭连接
      this.ws.close();
      this.ws = null;
    }

    this.listening = false;
  }

  /**
   * 处理接收到的事件
   * @param event 事件对象
   */
  private handleEvent(event: OB11Event): void {
    // 将事件添加到队列
    this.eventQueue.push(event);

    // 检查是否有匹配的事件处理器
    for (let i = this.eventHandlers.length - 1; i >= 0; i--) {
      const handler = this.eventHandlers[i];
      if (this.matchesFilter(event, handler.filter)) {
        // 找到匹配的处理器
        clearTimeout(handler.timeout);
        this.eventHandlers.splice(i, 1);
        handler.resolve(event);
      }
    }
  }

  /**
   * 检查事件是否匹配过滤器
   * @param event 事件对象
   * @param filter 过滤器
   * @returns 是否匹配
   */
  private matchesFilter(event: OB11Event, filter: EventFilter): boolean {
    // 检查事件类型
    if (filter.type !== undefined) {
      // 支持多种类型匹配方式
      if (event.post_type !== filter.type) {
        // 也检查更具体的类型字段
        const eventType = this.getEventType(event);
        if (eventType !== filter.type) {
          return false;
        }
      }
    }

    // 检查用户 ID
    if (filter.userId !== undefined) {
      const userId = this.getUserId(event);
      if (userId !== filter.userId && userId !== String(filter.userId)) {
        return false;
      }
    }

    // 检查群 ID
    if (filter.groupId !== undefined) {
      const groupId = this.getGroupId(event);
      if (groupId !== filter.groupId && groupId !== String(filter.groupId)) {
        return false;
      }
    }

    // 检查消息 ID
    if (filter.messageId !== undefined) {
      const messageId = this.getMessageId(event);
      if (messageId !== filter.messageId && messageId !== String(filter.messageId)) {
        return false;
      }
    }

    // 检查其他自定义过滤条件
    for (const key in filter) {
      if (key !== 'type' && key !== 'userId' && key !== 'groupId' && key !== 'messageId') {
        if (event[key] !== filter[key]) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 获取事件的完整类型
   * @param event 事件对象
   * @returns 事件类型字符串
   */
  private getEventType(event: OB11Event): string {
    let type = event.post_type;

    // 对于消息事件，添加消息类型
    if (event.post_type === 'message' && event.message_type) {
      type = `${type}.${event.message_type}`;
    }

    // 对于通知事件，添加通知类型
    if (event.post_type === 'notice' && event.notice_type) {
      type = `${type}.${event.notice_type}`;
    }

    // 对于请求事件，添加请求类型
    if (event.post_type === 'request' && event.request_type) {
      type = `${type}.${event.request_type}`;
    }

    return type;
  }

  /**
   * 从事件中提取用户 ID
   * @param event 事件对象
   * @returns 用户 ID
   */
  private getUserId(event: OB11Event): string | undefined {
    return String(event.user_id || event.sender?.user_id || undefined);
  }

  /**
   * 从事件中提取群 ID
   * @param event 事件对象
   * @returns 群 ID
   */
  private getGroupId(event: OB11Event): string | undefined {
    return String(event.group_id || undefined);
  }

  /**
   * 从事件中提取消息 ID
   * @param event 事件对象
   * @returns 消息 ID
   */
  private getMessageId(event: OB11Event): string | undefined {
    return String(event.message_id || undefined);
  }

  /**
   * 等待特定事件
   * @param filter 事件过滤器
   * @param timeout 超时时间（毫秒）
   * @returns Promise，解析为匹配的事件
   * @throws {TimeoutError} 等待超时
   */
  async waitForEvent(filter: EventFilter, timeout: number): Promise<OB11Event> {
    // 首先检查事件队列中是否已有匹配的事件
    for (let i = 0; i < this.eventQueue.length; i++) {
      const event = this.eventQueue[i];
      if (this.matchesFilter(event, filter)) {
        // 从队列中移除该事件
        this.eventQueue.splice(i, 1);
        return event;
      }
    }

    // 如果队列中没有匹配的事件，等待新事件
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutHandle = setTimeout(() => {
        // 从处理器列表中移除
        const index = this.eventHandlers.findIndex((h) => h.timeout === timeoutHandle);
        if (index !== -1) {
          this.eventHandlers.splice(index, 1);
        }

        // 抛出超时错误
        reject(new TimeoutError(
          `Waiting for event timeout after ${timeout}ms. Filter: ${JSON.stringify(filter)}`,
          timeout
        ));
      }, timeout);

      // 添加到处理器列表
      this.eventHandlers.push({
        filter,
        resolve,
        reject,
        timeout: timeoutHandle,
      });
    });
  }

  /**
   * 检查是否正在监听
   * @returns 是否正在监听
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * 获取事件队列长度
   * @returns 队列中的事件数量
   */
  getQueueLength(): number {
    return this.eventQueue.length;
  }

  /**
   * 清空事件队列
   */
  clearQueue(): void {
    this.eventQueue = [];
  }
}
