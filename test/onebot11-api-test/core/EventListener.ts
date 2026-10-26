import WebSocket from 'ws';
import axios from 'axios';
import { isDeepStrictEqual } from 'node:util';
import { ApiClient, TimeoutError } from './ApiClient.js';
import { IApiClient, IEventListener } from '../../test-framework/src/index.js';
import type { OB11Event } from '../../../src/onebot11/event/index.js';

export interface EventFilter {
  post_type?: string;
  sub_type?: string;
  message_type?: string;
  notice_type?: string;
  request_type?: string;
  user_id?: string | number;
  group_id?: string | number;
  message_id?: string | number;
  [key: string]: string | number | undefined;
}

export type { OB11Event };

/** HTTP 走 SSE, WS 走 WebSocket */
export class EventListener implements IEventListener<OB11Event, EventFilter> {
  private client: IApiClient;
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

  constructor(client: IApiClient) {
    this.client = client;
    const config = this.client.getConfig();
    this.protocol = config.protocol as 'http' | 'ws';
  }

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

  private async startWebSocketListening(): Promise<void> {
    const config = this.client.getConfig();

    let wsUrl = config.host;
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = 'ws://' + wsUrl;
    }

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

          this.eventHandlers.forEach((handler) => {
            clearTimeout(handler.timeout);
            handler.reject(new Error('EventListener connection closed'));
          });
          this.eventHandlers = [];
        });

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

  stopListening(): void {
    if (this.protocol === 'http' && this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    } else if (this.protocol === 'ws' && this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.eventHandlers.forEach((handler) => {
      clearTimeout(handler.timeout);
      handler.reject(new Error('EventListener stopped'));
    });
    this.eventHandlers = [];

    this.eventQueue = [];
    this.listening = false;
  }

  private handleEvent(event: OB11Event): void {
    // 有挂起的 handler 要它就直接消费, 不进队列: 不然下一个 waitForEvent 还能从队列里再拿到一次
    for (let i = this.eventHandlers.length - 1; i >= 0; i--) {
      const handler = this.eventHandlers[i];
      if (this.matchesFilter(event, handler.filter) && (!handler.customFilter || handler.customFilter(event))) {
        clearTimeout(handler.timeout);
        this.eventHandlers.splice(i, 1);
        handler.resolve(event);
        return
      }
    }
    this.eventQueue.push(event);
  }

  private matchesFilter(event: OB11Event, filter: EventFilter): boolean {
    if (filter.post_type !== undefined && event.post_type !== filter.post_type) {
      return false;
    }

    if (filter.sub_type !== undefined && event.sub_type !== filter.sub_type) {
      return false;
    }

    if (filter.message_type !== undefined && event.message_type !== filter.message_type) {
      return false;
    }

    if (filter.notice_type !== undefined && event.notice_type !== filter.notice_type) {
      return false;
    }

    if (filter.request_type !== undefined && event.request_type !== filter.request_type) {
      return false;
    }

    if (filter.user_id !== undefined) {
      const filterUserId = String(filter.user_id);
      const eventUserId = String(event.user_id || event.sender?.user_id || '');
      if (eventUserId !== filterUserId) {
        return false;
      }
    }

    if (filter.group_id !== undefined) {
      const filterGroupId = String(filter.group_id);
      const eventGroupId = String(event.group_id || '');
      if (eventGroupId !== filterGroupId) {
        return false;
      }
    }

    if (filter.message_id !== undefined) {
      const filterMessageId = String(filter.message_id);
      const eventMessageId = String(event.message_id || '');
      if (eventMessageId !== filterMessageId) {
        return false;
      }
    }

    // 其余字段用 Node 内置的深度比较
    for (const key in filter) {
      if (!['post_type', 'sub_type', 'message_type', 'notice_type', 'request_type',
        'user_id', 'group_id', 'message_id'].includes(key)) {
        if (!isDeepStrictEqual(event[key], filter[key])) {
          return false;
        }
      }
    }

    return true;
  }

  async waitForEvent(
    filter: EventFilter,
    customFilter?: (event: OB11Event) => boolean,
    timeout: number = 20000
  ): Promise<OB11Event> {
    for (let i = 0; i < this.eventQueue.length; i++) {
      const event = this.eventQueue[i];
      if (this.matchesFilter(event, filter) && (!customFilter || customFilter(event))) {
        this.eventQueue.splice(i, 1);
        return event;
      }
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const index = this.eventHandlers.findIndex((h) => h.timeout === timeoutHandle);
        if (index !== -1) {
          this.eventHandlers.splice(index, 1);
        }

        reject(new TimeoutError(
          `Waiting for event timeout after ${timeout}ms. Filter: ${JSON.stringify(filter)}`,
          timeout
        ));
      }, timeout);

      this.eventHandlers.push({
        filter,
        resolve,
        reject,
        timeout: timeoutHandle,
        customFilter,
      });
    });
  }

  isListening(): boolean {
    return this.listening;
  }

  getQueueLength(): number {
    return this.eventQueue.length;
  }

  clearQueue(): void {
    this.eventQueue = []
  }
}
