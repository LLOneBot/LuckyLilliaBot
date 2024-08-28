import { LLOneBotError } from './types'
import { SelfInfo } from '../ntqqapi/types'
import path from 'node:path'

export const llonebotError: LLOneBotError = {
  ffmpegError: '',
  httpServerError: '',
  wsServerError: '',
  otherError: 'LLOneBot 未能正常启动，请检查日志查看错误',
}

export const DATA_DIR: string = global.LiteLoader.plugins['LLOneBot'].path.data
export const TEMP_DIR: string = path.join(DATA_DIR, 'temp')
export const PLUGIN_DIR: string = global.LiteLoader.plugins['LLOneBot'].path.plugin
export const LOG_DIR = path.join(DATA_DIR, 'logs')

export const selfInfo: SelfInfo = {
  uid: '',
  uin: '',
  nick: '',
  online: true,
}