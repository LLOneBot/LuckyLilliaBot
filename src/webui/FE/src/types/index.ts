// API 相关类型
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ResConfig {
  token: string;
  config: Config;
  selfInfo: SelfInfo;
}

export interface ReqConfig {
  token: string;
  config: Config;
}

export interface SelfInfo {
  nick: string;
  uin: string;
  online: boolean;
  nickname?: string;
}

// 配置类型
export interface Config {
  ob11: OB11Config;
  satori: SatoriConfig;
  heartInterval: number;
  enableLocalFile2Url: boolean;
  debug: boolean;
  log: boolean;
  autoDeleteFile: boolean;
  autoDeleteFileSecond: number;
  musicSignUrl: string;
  msgCacheExpire: number;
  receiveOfflineMsg: boolean;
  onlyLocalhost: boolean;
  webui: WebuiConfig;
}

export interface OB11Config {
  enable: boolean;
  token: string;
  enableWs: boolean;
  wsPort: number;
  enableWsReverse: boolean;
  wsReverseUrls: string[];
  enableHttp: boolean;
  httpPort: number;
  enableHttpPost: boolean;
  enableHttpHeart: boolean;
  httpPostUrls: string[];
  httpSecret: string;
  messagePostFormat: 'array' | 'string';
  reportSelfMessage: boolean;
}

export interface SatoriConfig {
  enable: boolean;
  port: number;
  token: string;
}

export interface WebuiConfig {
  token: string;
}
