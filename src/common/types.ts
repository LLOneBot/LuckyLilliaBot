export interface BaseConnectConfig {
  type: string
  name?: string
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

export type QQOfficialIntent =
  | 'GROUP_AND_C2C_EVENT' | 'GROUP_MEMBER_EVENT' | 'INTERACTION' | 'MESSAGE_AUDIT'
  | 'GUILDS' | 'GUILD_MEMBERS' | 'GUILD_MESSAGES' | 'GUILD_MESSAGE_REACTIONS' | 'DIRECT_MESSAGE' | 'PUBLIC_GUILD_MESSAGES'
  | 'FORUMS_EVENT' | 'OPEN_FORUMS_EVENT' | 'AUDIO_ACTION' | 'AUDIO_OR_LIVE_CHANNEL_MEMBER'

/** An item of the C2C custom menu */
export type QQOfficialMenuItem =
  | { type: 'send_message' | 'link'; name: string; value: string }
  | { type: 'switch'; name: string; value: string; switchDefault: boolean }
  | { type: 'menu'; name: string; subMenuItems: { type: 'send_message' | 'link'; name: string; value: string }[] }

/** An item of the group command panel */
export type QQOfficialPanelItem =
  | { type: 'command'; name: string; description: string; onlyAdmin: boolean }
  | { type: 'link'; name: string; description: string; value: string; onlyAdmin: boolean }

export interface QQOfficialConfig {
  appId: string
  secret: string
  sandbox: boolean
  /** Private bots receive every guild message, public ones only those that @ them */
  type: 'public' | 'private'
  intents: QQOfficialIntent[]
  useMarkdownIfAt: boolean
  autoStreamText: ('private' | 'group' | 'guild')[]
  retryWhen: number[]
  manualAcknowledge: boolean
  privateSlash: boolean
  privateMenu: QQOfficialMenuItem[]
  groupSlash: boolean
  groupPanels: QQOfficialPanelItem[]
  endpoint: string
  gatewayUrl: string
  userInfoApi: string
  disableUserNamePersist: boolean
  debug: boolean
}

/** builtin:nt-protocol: how the scanned account logs in */
export interface NTProtocolConfig {
  /** The pure protocol, or NativeQQ bridging an official QQ client */
  mode: 'direct' | 'nativeqq'
  /** The QQ client the pure protocol passes for; NativeQQ ignores it */
  protocol: 'linux' | 'macos' | 'windows' | 'watch'
  /** The QQ the bridge starts, empty: the one NativeQQ finds. A NativeQQ configuration file is only given at launch */
  nativeQQ: { qqPath: string }
  /** The account to log in when this instance starts; empty disables automatic login. */
  autoLoginUin: string
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
  log?: boolean
  logLevel?: 'error' | 'warn' | 'info' | 'debug' // 最低输出级别，--debug 优先
  /** @deprecated Retained for old settings; conversion uses the optional FFmpeg plugin. */
  ffmpeg?: string
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
