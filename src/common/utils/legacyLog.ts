import fs from 'fs'
import path from 'node:path'
import { getConfigUtil } from '../config'
import { LOG_DIR } from '../globalVars'
import { Dict } from 'cosmokit'

function truncateString(obj: Dict | null, maxLength = 500) {
  if (obj !== null && typeof obj === 'object') {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'string') {
        // 如果是字符串且超过指定长度，则截断
        if (obj[key].length > maxLength) {
          obj[key] = obj[key].substring(0, maxLength) + '...'
        }
      } else if (typeof obj[key] === 'object') {
        // 如果是对象或数组，则递归调用
        truncateString(obj[key], maxLength)
      }
    })
  }
  return obj
}

export const logFileName = `llonebot-${new Date().toLocaleString('zh-CN')}.log`.replace(/\//g, '-').replace(/:/g, '-')

export function log(...msg: unknown[]) {
  if (!getConfigUtil().getConfig().log) {
    return
  }
  let logMsg = ''
  for (const msgItem of msg) {
    // 判断是否是对象
    if (typeof msgItem === 'object') {
      logMsg += JSON.stringify(truncateString(msgItem)) + ' '
      continue
    }
    logMsg += msgItem + ' '
  }
  const currentDateTime = new Date().toLocaleString()
  logMsg = `${currentDateTime} ${logMsg}\n\n`
  fs.appendFile(path.join(LOG_DIR, logFileName), logMsg, () => { })
}
