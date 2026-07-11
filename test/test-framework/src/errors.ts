/** 网络层错误（连接失败、HTTP 非 2xx 等） */
export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message)
    this.name = 'NetworkError'
  }
}

/** 等待事件 / 调用接口超时 */
export class TimeoutError extends Error {
  constructor(message: string, public readonly duration: number) {
    super(message)
    this.name = 'TimeoutError'
  }
}
