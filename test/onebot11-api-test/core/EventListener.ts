import WebSocket from 'ws';
import axios from 'axios';
import { ApiClient, TimeoutError } from './ApiClient.js';
// 使用源码中定义的事件类型，避免重复定义
import type { OB11Event } from '../../../src/onebot11/event/index.js';
import * as console from 'node:console'

/**
 * 事件过滤器接口
 */
export interface EventFilter {
  post_type?: string;
  sub_type?: string;
  message_type?: string;
  notice_type?: string;
  request_type?: string;
  user_id?: string | number;
  group_id?: string | number;
  message_id?: string | number;
  [key: string]: any;
}

// 重新导出事件类型供外部使用
export type { OB11Event };

/**
 * 事件监听器
 * 支持 HTTP SSE 和 WebSocket 两种协议监听事件
 */
export class EventListener {
  private client: ApiClient;
  private protocol: 'http' | 'ws';
  private ws: WebSocket | null = null;
  private sseAbortController: AbortController | null = null;
  private listening: boolean = false;
  private eventQueue: OB11Event[] = [];
  private eventHandlers: Array<{
    filter: EventFilter;
    resolve: (event: OB11Event) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    customFilter?: (event: OB11Event) => boolean;
  }> = [];

  /**
   * 构造函数
   * @param client API 客户端实例
   */
  constructor(client: ApiClient) {
    this.client = client;
    const config = this.client.getConfig();
    this.protocol = config.protocol;
  }

  /**
   * 开始监听事件
   */
  async startListening(): Promise<void> {
    if (this.listening) {
      return;
    }

    if (this.protocol === 'http') {
      await this.startHttpSseListening();
    } else {
      await this.startWebSocketListening();
    }
  }

  /**
   * 开始 HTTP SSE 监听
   */
  private async startHttpSseListening(): Promise<void> {
    const config = this.client.getConfig();
    const sseUrl = `${config.host}/_events`;

    this.sseAbortController = new AbortController();
    this.listening = true;

    try {
      const headers: any = {
        'Accept': 'text/event-stream',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await axios.get(sseUrl, {
        headers,
        responseType: 'stream',
        signal: this.sseAbortController.signal,
      });

      const stream = response.data;
      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = line.substring(6);
              const event = JSON.parse(eventData) as OB11Event;
              // console.log('Received SSE event:', eventData);
              this.handleEvent(event);
            } catch (error) {
              console.error('Failed to parse SSE event:', error);
            }
          }
        }
      });

      stream.on('end', () => {
        this.listening = false;
        this.sseAbortController = null;
      });

      stream.on('error', (error: Error) => {
        if (process.env.NODE_ENV !== 'test') {
          console.error('SSE stream error:', error);
        }
        this.listening = false;
        this.sseAbortController = null;
      });

    } catch (error) {
      this.listening = false;
      this.sseAbortController = null;
      throw error;
    }
  }

  /**
   * 开始 WebSocket 监听
   */
  private async startWebSocketListening(): Promise<void> {
    const config = this.client.getConfig();

    // 构建 WebSocket URL
    let wsUrl = config.host;
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = 'ws://' + wsUrl;
    }

    // WebSocket 连接到根路径 /
    if (!wsUrl.endsWith('/')) {
      wsUrl = wsUrl + '/';
    }

    return new Promise((resolve, reject) => {
      try {
        const headers: any = {};
        if (config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        this.ws = new WebSocket(wsUrl, { headers });

        this.ws.on('open', () => {
          this.listening = true;
          if (process.env.NODE_ENV !== 'test') {
            console.log(`EventListener WebSocket connected to ${wsUrl}`);
          }
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const event = JSON.parse(data.toString()) as OB11Event;
            this.handleEvent(event);
          } catch (error) {
            console.error('Failed to parse WebSocket event:', error);
          }
        });

        this.ws.on('error', (error: Error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('EventListener WebSocket error:', error);
          }
          this.listening = false;
          reject(error);
        });

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
            reject(new TimeoutError('WebSocket connection timeout', 10000));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止监听事件
   */
  stopListening(): void {
    if (this.protocol === 'http' && this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    } else if (this.protocol === 'ws' && this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // 清理所有待处理的事件处理器
    this.eventHandlers.forEach((handler) => {
      clearTimeout(handler.timeout);
      handler.reject(new Error('EventListener stopped'));
    });
    this.eventHandlers = [];

    // 清空事件队列
    this.eventQueue = [];
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
      if (this.matchesFilter(event, handler.filter) && (!handler.customFilter || handler.customFilter(event))) {
        // 找到匹配的处理器
        clearTimeout(handler.timeout);
        this.eventHandlers.splice(i, 1);
        handler.resolve(event);
      }
    }
  }

  /**
   * 深度比较两个值是否相等
   * @param a 值 A
   * @param b 值 B
   * @returns 是否相等
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a == null || b == null) return a === b;

    if (typeof a !== typeof b) return false;

    if (typeof a !== 'object') return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (Array.isArray(a) || Array.isArray(b)) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  /**
   * 检查事件是否匹配过滤器
   * @param event 事件对象
   * @param filter 过滤器
   * @returns 是否匹配
   */
  private matchesFilter(event: OB11Event, filter: EventFilter): boolean {
    // 检查 post_type
    if (filter.post_type !== undefined && event.post_type !== filter.post_type) {
      return false;
    }

    // 检查 sub_type
    if (filter.sub_type !== undefined && event.sub_type !== filter.sub_type) {
      return false;
    }

    // 检查 message_type
    if (filter.message_type !== undefined && event.message_type !== filter.message_type) {
      return false;
    }

    // 检查 notice_type
    if (filter.notice_type !== undefined && event.notice_type !== filter.notice_type) {
      return false;
    }

    // 检查 request_type
    if (filter.request_type !== undefined && event.request_type !== filter.request_type) {
      return false;
    }

    // 检查 user_id
    if (filter.user_id !== undefined) {
      const filterUserId = String(filter.user_id);
      const eventUserId = String(event.user_id || event.sender?.user_id || '');
      if (eventUserId !== filterUserId) {
        return false;
      }
    }

    // 检查 group_id
    if (filter.group_id !== undefined) {
      const filterGroupId = String(filter.group_id);
      const eventGroupId = String(event.group_id || '');
      if (eventGroupId !== filterGroupId) {
        return false;
      }
    }

    // 检查 message_id
    if (filter.message_id !== undefined) {
      const filterMessageId = String(filter.message_id);
      const eventMessageId = String(event.message_id || '');
      if (eventMessageId !== filterMessageId) {
        return false;
      }
    }

    // 检查其他自定义过滤条件（使用深度比较）
    for (const key in filter) {
      if (!['post_type', 'sub_type', 'message_type', 'notice_type', 'request_type',
            'user_id', 'group_id', 'message_id'].includes(key)) {
        if (!this.deepEqual(event[key], filter[key])) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 等待特定事件
   * @param filter 事件过滤器
   * @param customFilter 自定义过滤函数，用于更复杂的匹配逻辑
   * @param timeout 超时时间（毫秒），默认 10000ms
   * @returns Promise，解析为匹配的事件
   * @throws {TimeoutError} 等待超时
   */
  async waitForEvent(
    filter: EventFilter,
    customFilter?: (event: OB11Event) => boolean,
    timeout: number = 10000
  ): Promise<OB11Event> {
    // 首先检查事件队列中是否已有匹配的事件
    for (let i = 0; i < this.eventQueue.length; i++) {
      const event = this.eventQueue[i];
      if (this.matchesFilter(event, filter) && (!customFilter || customFilter(event))) {
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

      // 添加到处理器列表，包含自定义过滤器
      this.eventHandlers.push({
        filter,
        resolve,
        reject,
        timeout: timeoutHandle,
        customFilter,
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
