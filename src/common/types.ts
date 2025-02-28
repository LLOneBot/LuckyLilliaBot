export interface OB11Config {
  enable: boolean
  httpPort: number
  httpHosts: string[]
  httpSecret?: string
  wsPort: number
  wsHosts: string[]
  enableHttp?: boolean
  enableHttpPost?: boolean
  enableWs?: boolean
  enableWsReverse?: boolean
  messagePostFormat?: 'array' | 'string'
  enableHttpHeart?: boolean
  /**
   * 快速操作回复自动引用原消息
   * @deprecated
   */
  enableQOAutoQuote?: boolean
  listenLocalhost: boolean
  reportSelfMessage: boolean
}

export interface SatoriConfig {
  enable: boolean
  listen: string
  port: number
  token: string
}

export interface Config {
  enableLLOB: boolean
  satori: SatoriConfig
  ob11: OB11Config
  token?: string
  heartInterval: number // ms
  enableLocalFile2Url?: boolean // 开启后，本地文件路径图片会转成http链接, 语音会转成base64
  debug?: boolean
  log?: boolean
  autoDeleteFile?: boolean
  autoDeleteFileSecond?: number
  ffmpeg?: string // ffmpeg路径
  musicSignUrl?: string
  ignoreBeforeLoginMsg?: boolean
  /** 单位为秒 */
  msgCacheExpire?: number
  /** @deprecated */
  http?: string
  /** @deprecated */
  hosts?: string[]
  /** @deprecated */
  wsPort?: string
  /** @deprecated */
  reportSelfMessage?: boolean
}

export interface CheckVersion {
  result: boolean
  version: string
}

export interface LLOneBotError {
  httpServerError?: string
  wsServerError?: string
  ffmpegError?: string
  otherError?: string
}

export interface FileCache {
  fileName: string
  fileSize: string
  msgId: string
  peerUid: string
  chatType: number
  elementId: string
  elementType: number
}

export interface FileCacheV2 {
  fileName: string
  fileSize: string
  fileUuid: string
  msgId: string
  msgTime: number
  peerUid: string
  chatType: number
  elementId: string
  elementType: number
}
