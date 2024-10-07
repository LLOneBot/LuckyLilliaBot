import fs from 'fs'
import path from 'node:path'
import { getConfigUtil } from '../config'
import { LOG_DIR } from '../globalVars'
import { inspect } from 'node:util'

export const logFileName = `llonebot-${new Date().toLocaleString('zh-CN')}.log`.replace(/\//g, '-').replace(/:/g, '-')

export function log(...msg: unknown[]) {
  if (!getConfigUtil().getConfig().log) {
    return
  }
  let logMsg = ''
  for (const msgItem of msg) {
    if (typeof msgItem === 'object') {
      logMsg += inspect(msgItem, {
        depth: 10,
        compact: true,
        breakLength: Infinity,
        maxArrayLength: 220
      }) + ' '
    } else {
      logMsg += msgItem + ' '
    }
  }
  const currentDateTime = new Date().toLocaleString()
  logMsg = `${currentDateTime} ${logMsg}\n\n`
  fs.appendFile(path.join(LOG_DIR, logFileName), logMsg, () => { })
}
