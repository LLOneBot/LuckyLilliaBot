import axios, { AxiosInstance, AxiosError } from 'axios';
import WebSocket from 'ws';
import { ActionName } from '../../../src/plugin/internal/adapter/onebot11/action/types.js';
import {
  IApiClient,
  AccountConnectionConfig,
  NetworkError,
  TimeoutError,
} from '../../test-framework/src/index.js';

// 兼容旧 import
export { NetworkError, TimeoutError };

export interface AccountConfig extends AccountConnectionConfig {
  protocol: 'http' | 'ws'
  apiKey: string
}

export interface ApiResponse<T = any> {
  status: string;
  retcode: number;
  data: T;
  echo?: string;
  message: string;
  wording: string
}

interface WsRequest {
  action: ActionName;
  params: unknown;
  echo?: string;
}

export class ApiClient implements IApiClient {
  private config: AccountConfig;
  private httpClient: AxiosInstance;
  private retryAttempts: number;
  private ws: WebSocket | null = null;
  private wsConnecting: boolean = false;
  private wsReconnectAttempts: number = 0;
  private maxWsReconnectAttempts: number = 5;
  private wsReconnectDelay: number = 1000;
  private pendingRequests: Map<string, {
    resolve: (value: ApiResponse) => void;
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: AccountConfig, retryAttempts: number = 3) {
    this.config = config;
    this.retryAttempts = retryAttempts;

    this.httpClient = axios.create({
      baseURL: config.host,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (config.apiKey) {
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  async callHttp(action: ActionName, params: any = {}): Promise<ApiResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.httpClient.post(`/${action}`, params);

        return response.data as ApiResponse;
      } catch (error) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
            console.warn(`HTTP request timeout (attempt ${attempt + 1}/${this.retryAttempts}): ${action}`);
            continue;
          }

          if (axiosError.response) {
            throw new NetworkError(
              `HTTP request failed with status ${axiosError.response.status}: ${action}`,
              error as Error
            );
          } else if (axiosError.request) {
            console.warn(`No response received (attempt ${attempt + 1}/${this.retryAttempts}): ${action}`);
            continue;
          }
        }

        throw new NetworkError(
          `HTTP request failed: ${action}`,
          error as Error
        );
      }
    }

    if (lastError) {
      if (axios.isAxiosError(lastError)) {
        const axiosError = lastError as AxiosError;
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new TimeoutError(
            `HTTP request timeout after ${this.retryAttempts} attempts: ${action}`,
            this.httpClient.defaults.timeout || 30000
          );
        }
      }
      throw new NetworkError(
        `HTTP request failed after ${this.retryAttempts} attempts: ${action}`,
        lastError
      );
    }

    throw new NetworkError(`HTTP request failed: ${action}`);
  }

  private async connectWs(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.wsConnecting) {
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (!this.wsConnecting) {
            clearInterval(checkInterval);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              resolve();
            } else {
              reject(new NetworkError('WebSocket connection failed'));
            }
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new TimeoutError('WebSocket connection timeout', 10000));
        }, 10000);
      });
    }

    this.wsConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        let wsUrl = this.config.host;
        if (wsUrl.startsWith('http://')) {
          wsUrl = wsUrl.replace('http://', 'ws://');
        } else if (wsUrl.startsWith('https://')) {
          wsUrl = wsUrl.replace('https://', 'wss://');
        } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
          wsUrl = 'ws://' + wsUrl;
        }

        const headers: any = {};
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        this.ws = new WebSocket(wsUrl, { headers });

        this.ws.on('open', () => {
          this.wsConnecting = false;
          this.wsReconnectAttempts = 0;
          if (process.env.NODE_ENV !== 'test') {
            console.log(`WebSocket connected to ${wsUrl}`);
          }
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const response = JSON.parse(data.toString()) as ApiResponse;

            if (response.echo) {
              const pending = this.pendingRequests.get(response.echo);
              if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.echo);
                pending.resolve(response);
              }
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('error', (error: Error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('WebSocket error:', error);
          }
          this.wsConnecting = false;
          reject(new NetworkError('WebSocket connection error', error));
        });

        this.ws.on('close', () => {
          if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket connection closed');
          }
          this.ws = null;
          this.wsConnecting = false;

          this.pendingRequests.forEach((pending) => {
            clearTimeout(pending.timeout);
            pending.reject(new NetworkError('WebSocket connection closed'));
          });
          this.pendingRequests.clear();

          if (this.wsReconnectAttempts < this.maxWsReconnectAttempts) {
            this.attemptReconnect();
          }
        });

        setTimeout(() => {
          if (this.wsConnecting) {
            this.wsConnecting = false;
            if (this.ws) {
              this.ws.terminate();
            }
            reject(new TimeoutError('WebSocket connection timeout', 10000));
          }
        }, 10000);
      } catch (error) {
        this.wsConnecting = false;
        reject(new NetworkError('Failed to create WebSocket connection', error as Error));
      }
    });
  }

  private attemptReconnect(): void {
    if (this.wsReconnectAttempts >= this.maxWsReconnectAttempts) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`WebSocket reconnection failed after ${this.maxWsReconnectAttempts} attempts`);
      }
      return;
    }

    this.wsReconnectAttempts++;
    const delay = this.wsReconnectDelay * this.wsReconnectAttempts;

    if (process.env.NODE_ENV !== 'test') {
      console.log(`Attempting to reconnect WebSocket in ${delay}ms (attempt ${this.wsReconnectAttempts}/${this.maxWsReconnectAttempts})`);
    }

    setTimeout(() => {
      this.connectWs().catch((error) => {
        if (process.env.NODE_ENV !== 'test') {
          console.error('WebSocket reconnection failed:', error);
        }
      });
    }, delay);
  }

  async callWs(action: ActionName, params: any = {}): Promise<ApiResponse> {
    await this.connectWs();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new NetworkError('WebSocket is not connected');
    }

    const echo = `${action}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const request: WsRequest = {
      action,
      params,
      echo,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(echo);
        reject(new TimeoutError(`WebSocket request timeout: ${action}`, 30000));
      }, 30000);

      this.pendingRequests.set(echo, {
        resolve,
        reject,
        timeout,
      });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(echo);
        reject(new NetworkError(`Failed to send WebSocket request: ${action}`, error as Error));
      }
    });
  }

  /** 按配置的 protocol 走 HTTP 或 WS */
  async call(action: ActionName | string, params: any = {}): Promise<ApiResponse> {
    if (this.config.protocol === 'http') {
      return this.callHttp(action as ActionName, params);
    } else if (this.config.protocol === 'ws') {
      return this.callWs(action as ActionName, params);
    } else {
      throw new Error(`Unsupported protocol: ${this.config.protocol}`);
    }
  }

  disconnect(): void {
    this.disconnectWs();
  }

  disconnectWs(): void {
    if (this.ws) {
      this.pendingRequests.forEach((pending) => {
        clearTimeout(pending.timeout);
        pending.reject(new NetworkError('WebSocket connection manually closed'));
      });
      this.pendingRequests.clear();

      this.ws.close();
      this.ws = null;
    }

    this.wsReconnectAttempts = this.maxWsReconnectAttempts; // 防止自动重连
  }

  getConfig(): AccountConfig {
    return { ...this.config };
  }

  getWsState(): number | null {
    return this.ws ? this.ws.readyState : null;
  }
}
