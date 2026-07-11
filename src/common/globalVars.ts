import { SelfInfo } from '../ntqqapi/types'
import path from 'node:path'
import * as os from 'node:os'
import fs from 'fs'
import { existsSync, mkdirSync } from 'node:fs'

export const DATA_DIR: string = path.resolve('data')
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR)
}
export const TEMP_DIR: string = path.join(DATA_DIR, 'temp')
export const LOG_DIR = path.join(DATA_DIR, 'logs')

export const dbDir = path.join(DATA_DIR, 'database')
if (!existsSync(dbDir)) {
  mkdirSync(dbDir)
}

export function getFixedDataDir() {
  let dataDir: string = ''
  if (process.platform === 'win32') {
    dataDir = path.join(process.env['LOCALAPPDATA']!, 'llonebot')
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
  online: false,
}

// auth_token 生命周期状态, 由 authTokenWatcher 维护, 经 WebUI /api/auth-token/status 暴露给前端
export interface AuthTokenStatus {
  hasToken: boolean
  validation: 'idle' | 'validating' | 'valid' | 'invalid' | 'error'
  // validation 为 invalid/error 时的说明
  message: string
  // 登录/sign 阶段的错误 (如 auth_token 可用 QQ 数量已达上限); '' 表示无
  loginError: string
}

export const authTokenStatus: AuthTokenStatus = {
  hasToken: false,
  validation: 'idle',
  message: '',
  loginError: '',
}

