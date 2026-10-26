import type { Config as BackendConfig, WebUIConfig as BackendWebUIConfig } from '@common/types'

export type {
  OB11Config,
  SatoriConfig,
  MilkyConfig,
  MilkyHttpConfig,
  MilkyWebhookConfig,
  BaseConnectConfig,
  WsConnectConfig,
  WsReverseConnectConfig,
  HttpConnectConfig,
  HttpPostConnectConfig,
  EmailConfig,
} from '@common/types'

export type { SelfInfo } from '../../../ntqqapi/types/user'
export type { ResConfig, ReqConfig } from '../../BE/types'

// 要跟后端一致
export interface WebUIConfig {
  enable: boolean
  host: string
  port: number
}

export type Config = BackendConfig

export type ConnectConfig =
  | import('@common/types').WsConnectConfig
  | import('@common/types').WsReverseConnectConfig
  | import('@common/types').HttpConnectConfig
  | import('@common/types').HttpPostConnectConfig

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data: T
}
