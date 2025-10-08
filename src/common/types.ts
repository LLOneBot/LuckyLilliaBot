export interface BaseConnectConfig {
  type: string
  name?: string // 自定义名称
  enable: boolean
  token: string
  reportSelfMessage: boolean
  reportOfflineMessage: boolean
  messageFormat: 'array' | 'string'
  debug: boolean
}

export interface WsConnectConfig extends BaseConnectConfig {
  type: 'ws'
  port: number
  heartInterval: number // ms
}

export interface WsReverseConnectConfig extends BaseConnectConfig {
  type: 'ws-reverse'
  url: string
  heartInterval: number // ms
}

export interface HttpConnectConfig extends BaseConnectConfig {
  type: 'http'
  port: number
}

export interface HttpPostConnectConfig extends BaseConnectConfig {
  type: 'http-post'
  url: string
  enableHeart: boolean
  heartInterval: number // ms
}

export interface OB11Config {
  enable: boolean
  connect: (WsConnectConfig | WsReverseConnectConfig | HttpConnectConfig | HttpPostConnectConfig)[]
  // /** @deprecated */
  // token?: string
  // /** @deprecated */
  // httpPort?: number
  // /** @deprecated */
  // httpPostUrls?: string[]
  // /** @deprecated */
  // httpSecret?: string
  // /** @deprecated */
  // wsPort?: number
  // /** @deprecated */
  // wsReverseUrls?: string[]
  // /** @deprecated */
  // enableHttp?: boolean
  // /** @deprecated */
  // enableHttpPost?: boolean
  // /** @deprecated */
  // enableWs?: boolean
  // /** @deprecated */
  // enableWsReverse?: boolean
  // /** @deprecated */
  // messagePostFormat?: 'array' | 'string'
  // /** @deprecated */
  // enableHttpHeart?: boolean
  // /**
  //  * 快速操作回复自动引用原消息
  //  * @deprecated
  //  */
  // enableQOAutoQuote?: boolean
  // /** @deprecated */
  // reportSelfMessage?: boolean
}

export interface SatoriConfig {
  enable: boolean
  port: number
  token: string
}

export interface WebUIConfig {
  enable: boolean
  port: number
}

export interface Config {
  satori: SatoriConfig
  ob11: OB11Config
  webui: WebUIConfig
  onlyLocalhost: boolean
  enableLocalFile2Url?: boolean // 开启后，本地文件路径图片会转成http链接, 语音会转成base64
  log?: boolean
  autoDeleteFile?: boolean
  autoDeleteFileSecond?: number
  ffmpeg?: string // ffmpeg路径
  musicSignUrl?: string
  msgCacheExpire?: number // second
  // /** @deprecated */
  // heartInterval?: number // ms
  // /** @deprecated */
  // receiveOfflineMsg?: boolean // 是否接收离线消息
  // /** @deprecated */
  // debug?: boolean
}

export interface CheckVersion {
  result: boolean
  version: string
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
