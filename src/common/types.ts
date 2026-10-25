export interface BaseConnectConfig {
  type: string
  name?: string // 自定义名称
  enable: boolean
  token: string
  reportSelfMessage: boolean
  reportOfflineMessage: boolean
  messageFormat: 'array' | 'string'
  debug: boolean
  filter?: Record<string, unknown>
}

export interface WsConnectConfig extends BaseConnectConfig {
  type: 'ws'
  host: string
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
  host: string
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
  host: string
  port: number
  token: string
}

export interface MilkyHttpConfig {
  host: string
  port: number
  prefix: string
  accessToken: string
}

export interface MilkyWebhookConfig {
  urls: string[]
  accessToken: string
}

export interface MilkyConfig {
  enable: boolean
  reportSelfMessage: boolean
  http: MilkyHttpConfig
  webhook: MilkyWebhookConfig
}

export interface WebUIConfig {
  enable: boolean
  host: string
  port: number
}

export interface EmailConfig {
  enabled: boolean
  smtp: {
    host: string
    port: number
    secure: boolean
    auth: {
      user: string
      pass: string
    }
  }
  from: string
  to: string
}

/** The bot's own settings, an instance's settings.json. The adapters keep theirs in their plugin entries. */
export interface Config {
  webui: WebUIConfig
  email?: EmailConfig
  // onlyLocalhost: boolean
  enableLocalFile2Url?: boolean // 开启后，本地文件路径图片会转成http链接, 语音会转成base64
  log?: boolean
  logLevel?: 'info' | 'debug' // 'debug' 打开底层详情日志 (等价 --debug); 默认 'info'
  ffmpeg?: string // ffmpeg路径
  /** Makes OneBot music cards: song parameters in, a signed card out, as ss.xingzhige.com does. */
  musicCardSignUrl?: string
  msgCacheExpire?: number // second
  // /** @deprecated */
  // heartInterval?: number // ms
  // /** @deprecated */
  // receiveOfflineMsg?: boolean // 是否接收离线消息
  // /** @deprecated */
  // debug?: boolean
}

/** The adapters' sections, in the shape the bot's config file had before they moved to their plugin entries. */
export interface AdapterSections {
  ob11: OB11Config
  satori: SatoriConfig
  milky: MilkyConfig
}

/** What OneBot get_config / set_config and POST /api/config still speak: the settings plus the adapters. */
export type LegacyConfig = Config & AdapterSections & {
  /** The old name of musicCardSignUrl, still read and written for the clients that know only that one. */
  musicSignUrl?: string
}

export interface CheckVersion {
  result: boolean
  version: string
}

export interface FileCache {
  fileName: string
  fileSize: string
  fileUuid: string
  msgTime: number
  peerUid: string
  chatType: number
  elementType: number
  md5HexStr: string
  /** 图片专用：原始 URL 路径（不含 rkey），获取时通过 getImageUrl 拼新鲜 rkey */
  originImageUrl?: string
}
