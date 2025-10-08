import { Config } from '@/common/types'
import { SelfInfo } from '@/ntqqapi/types'

export interface ResConfig{
  config: Config,
  selfInfo: SelfInfo
}

export interface ReqConfig extends Omit<ResConfig, 'selfInfo'> {}
