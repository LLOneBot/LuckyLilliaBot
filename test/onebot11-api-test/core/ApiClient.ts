import axios, { AxiosInstance, AxiosError } from 'axios';
import WebSocket from 'ws';
import { AccountConfig } from '../config/ConfigLoader.js';

/**
 * API 响应接口
 */
export interface ApiResponse<T = any> {
  status: string;
  retcode: number;
  data: T;
  echo?: string;
}

/**
 * WebSocket 请求接口
 */
interface WsRequest {
  action: string;
  params: any;
  echo?: string;
}

/**
 * 网络错误
 */
export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends Error {
  constructor(message: string, public readonly duration: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * API 客户端
 * 支持 HTTP 和 WebSocket 两种协议调用 OneBot11 接口
 */
export class ApiClient {
  private config: AccountConfig;
  private httpClient: AxiosInstance;
  private retryAttempts: number;
  private ws: WebSocket | null = null;
  private wsConnecting: boolean = false;
  private wsReconnectAttempts: number = 0;
  private maxWsReconnectAttempts: number = 5;
  private wsReconnectDelay: number = 1000; // 1 second
  private pendingRequests: Map<string, {
    resolve: (value: ApiResponse) => void;
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: AccountConfig, retryAttempts: number = 3) {
    this.config = config;
    this.retryAttempts = retryAttempts;

    // 创建 axios 实例
    this.httpClient = axios.create({
      baseURL: config.host,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 如果有 apiKey，设置 Authorization 头
    if (config.apiKey) {
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  /**
   * HTTP 方式调用接口
   * @param action 接口名称
   * @param params 接口参数
   * @returns API 响应
   * @throws {NetworkError} 网络请求失败
   * @throws {TimeoutError} 请求超时
   */
  async callHttp(action: string, params: any = {}): Promise<ApiResponse> {
    let lastError: Error | undefined;

    // 重试机制
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.httpClient.post(`/${action}`, params);
        
        // 返回响应数据
        return response.data as ApiResponse;
      } catch (error) {
        lastError = error as Error;

        // 判断是否是超时错误
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          
          if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
            // 超时错误，继续重试
            console.warn(`HTTP request timeout (attempt ${attempt + 1}/${this.retryAttempts}): ${action}`);
            continue;
          }

          // 其他 axios 错误
          if (axiosError.response) {
            // 服务器返回了错误响应
            throw new NetworkError(
              `HTTP request failed with status ${axiosError.response.status}: ${action}`,
              error as Error
            );
          } else if (axiosError.request) {
            // 请求已发送但没有收到响应
            console.warn(`No response received (attempt ${attempt + 1}/${this.retryAttempts}): ${action}`);
            continue;
          }
        }

        // 其他未知错误
        throw new NetworkError(
          `HTTP request failed: ${action}`,
          error as Error
        );
      }
    }

    // 所有重试都失败了
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

  /**
   * 建立 WebSocket 连接
   * @returns Promise that resolves when connected
   */
  private async connectWs(): Promise<void> {
    // 如果已经连接或正在连接，直接返回
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.wsConnecting) {
      // 等待连接完成
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

        // 10秒超时
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new TimeoutError('WebSocket connection timeout', 10000));
        }, 10000);
      });
    }

    this.wsConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        // 将 http:// 或 https:// 转换为 ws:// 或 wss://
        let wsUrl = this.config.host;
        if (wsUrl.startsWith('http://')) {
          wsUrl = wsUrl.replace('http://', 'ws://');
        } else if (wsUrl.startsWith('https://')) {
          wsUrl = wsUrl.replace('https://', 'wss://');
        } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
          wsUrl = 'ws://' + wsUrl;
        }

        // 创建 WebSocket 连接
        const headers: any = {};
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        this.ws = new WebSocket(wsUrl, { headers });

        // 连接成功
        this.ws.on('open', () => {
          this.wsConnecting = false;
          this.wsReconnectAttempts = 0;
          if (process.env.NODE_ENV !== 'test') {
            console.log(`WebSocket connected to ${wsUrl}`);
          }
          resolve();
        });

        // 接收消息
        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const response = JSON.parse(data.toString()) as ApiResponse;
            
            // 根据 echo 字段找到对应的请求
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

        // 连接错误
        this.ws.on('error', (error: Error) => {
          // Only log in development, suppress in tests
          if (process.env.NODE_ENV !== 'test') {
            console.error('WebSocket error:', error);
          }
          this.wsConnecting = false;
          reject(new NetworkError('WebSocket connection error', error));
        });

        // 连接关闭
        this.ws.on('close', () => {
          if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket connection closed');
          }
          this.ws = null;
          this.wsConnecting = false;

          // 清理所有待处理的请求
          this.pendingRequests.forEach((pending) => {
            clearTimeout(pending.timeout);
            pending.reject(new NetworkError('WebSocket connection closed'));
          });
          this.pendingRequests.clear();

          // 尝试重连（仅在非测试环境或未手动断开时）
          if (this.wsReconnectAttempts < this.maxWsReconnectAttempts) {
            this.attemptReconnect();
          }
        });

        // 连接超时
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

  /**
   * 尝试重连 WebSocket
   */
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

  /**
   * WebSocket 方式调用接口
   * @param action 接口名称
   * @param params 接口参数
   * @returns API 响应
   * @throws {NetworkError} 网络请求失败
   * @throws {TimeoutError} 请求超时
   */
  async callWs(action: string, params: any = {}): Promise<ApiResponse> {
    // 确保 WebSocket 已连接
    await this.connectWs();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new NetworkError('WebSocket is not connected');
    }

    // 生成唯一的 echo 标识
    const echo = `${action}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 创建请求对象
    const request: WsRequest = {
      action,
      params,
      echo,
    };

    // 发送请求并等待响应
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(echo);
        reject(new TimeoutError(`WebSocket request timeout: ${action}`, 30000));
      }, 30000);

      // 保存待处理的请求
      this.pendingRequests.set(echo, {
        resolve,
        reject,
        timeout,
      });

      // 发送请求
      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(echo);
        reject(new NetworkError(`Failed to send WebSocket request: ${action}`, error as Error));
      }
    });
  }

  /**
   * 统一调用接口（根据配置的协议自动选择）
   * @param action 接口名称
   * @param params 接口参数
   * @returns API 响应
   */
  async call(action: string, params: any = {}): Promise<ApiResponse> {
    if (this.config.protocol === 'http') {
      return this.callHttp(action, params);
    } else if (this.config.protocol === 'ws') {
      return this.callWs(action, params);
    } else {
      throw new Error(`Unsupported protocol: ${this.config.protocol}`);
    }
  }

  /**
   * 断开 WebSocket 连接
   */
  disconnectWs(): void {
    if (this.ws) {
      // 清理所有待处理的请求
      this.pendingRequests.forEach((pending) => {
        clearTimeout(pending.timeout);
        pending.reject(new NetworkError('WebSocket connection manually closed'));
      });
      this.pendingRequests.clear();

      // 关闭连接
      this.ws.close();
      this.ws = null;
    }
    
    // 重置重连计数
    this.wsReconnectAttempts = this.maxWsReconnectAttempts; // 防止自动重连
  }

  /**
   * 获取配置
   */
  getConfig(): AccountConfig {
    return { ...this.config };
  }

  /**
   * 获取 WebSocket 连接状态
   */
  getWsState(): number | null {
    return this.ws ? this.ws.readyState : null;
  }
}
