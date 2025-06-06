export interface OB11Config {
  enable: boolean
  token: string
  httpPort: number
  httpPostUrls: string[]
  httpSecret?: string
  wsPort: number
  wsReverseUrls: string[]
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
  reportSelfMessage: boolean
}

export interface SatoriConfig {
  enable: boolean
  port: number
  token: string
}

export interface Config {
  satori: SatoriConfig
  ob11: OB11Config
  onlyLocalhost: boolean
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
