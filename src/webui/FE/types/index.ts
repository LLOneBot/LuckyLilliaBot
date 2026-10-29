import type { Config as BackendConfig, WebUIConfig as BackendWebUIConfig } from '@common/types'

export type { SelfInfo } from '../../../plugin/internal/protocol/nt-protocol/ntqqapi/types/user'
export type { ResConfig, ReqConfig } from '../../BE/types'

// 要跟后端一致
export interface WebUIConfig {
  enable: boolean
  host: string
  port: number
}

export type Config = BackendConfig

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data: T
}
