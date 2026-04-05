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

