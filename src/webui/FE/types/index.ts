// 直接从后端导出类型定义，避免代码重复
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
} from '@common/types'

// 从后端类型导出（使用相对路径）
export type { SelfInfo } from '../../../ntqqapi/types/user'
export type { ResConfig, ReqConfig } from '../../BE/types'

// 前端使用的 WebUIConfig 类型（只包含 token）
export interface WebUIConfig {
  enable: boolean
}

// 前端使用的 Config 类型（webui 字段使用前端版本）
export type Config = Omit<BackendConfig, 'webui'> & {
  webui: WebUIConfig
}

// 连接配置联合类型
export type ConnectConfig =
  | import('@common/types').WsConnectConfig
  | import('@common/types').WsReverseConnectConfig
  | import('@common/types').HttpConnectConfig
  | import('@common/types').HttpPostConnectConfig

// API 响应类型（前端特有）
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data: T
}
