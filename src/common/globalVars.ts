import { LLOneBotError } from './types'
import { SelfInfo } from '../ntqqapi/types'
import path from 'node:path'
import * as os from 'node:os'
import fs from 'fs'

export const llonebotError: LLOneBotError = {
  ffmpegError: '',
  httpServerError: '',
  wsServerError: '',
  otherError: 'LLOneBot 未能正常启动，请检查日志查看错误',
}

export const DATA_DIR: string = path.resolve('data')
export const TEMP_DIR: string = path.join(DATA_DIR, 'temp')
export const LOG_DIR = path.join(DATA_DIR, 'logs')

export function getFixedDataDir() {
  let dataDir: string = ''
  if (process.platform === 'win32') {
    dataDir = path.join(process.env['LOCALAPPDATA']!!, 'llonebot')
  }
  else {
    dataDir = path.join(os.homedir(), '.llonebot')
  }
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir)
    }catch (e) {

    }
  }
  return dataDir
}

export const selfInfo: SelfInfo = {
  uid: '',
  uin: '',
  nick: '',
  online: true,
}

