import path from 'node:path'
import { Context, Logger } from 'cordis'
import { appendFile } from 'node:fs'
import { LOG_DIR, selfInfo } from '@/common/globalVars'
import { noop } from 'cosmokit'

interface Config {
  enable: boolean
  filename: string
}

export default class Log {
  static name = 'logger'

  constructor(ctx: Context, cfg: Config) {
    Logger.targets.splice(0, Logger.targets.length)
    if (!cfg.enable) {
      return
    }
    const file = path.join(LOG_DIR, cfg.filename)
    const refreshNick = ctx.debounce(() => {
      const ntUserApi = ctx.get('ntUserApi')
      if (ntUserApi && !selfInfo.nick) {
        ntUserApi.getSelfNick(true)
      }
    }, 1000)
    const target: Logger.Target = {
      colors: 0,
      record: (record: Logger.Record) => {
        if (!selfInfo.nick) {
          refreshNick()
        }
        const dateTime = new Date(record.timestamp).toLocaleString()
        const userInfo = selfInfo.uin ? `${selfInfo.nick}(${selfInfo.uin})` : ''
        const content = `${dateTime} [${record.type}] ${userInfo} | ${record.name} ${record.content}\n\n`
        appendFile(file, content, noop)
      },
    }
    Logger.targets.push(target)
  }
}