import path from 'node:path'
import { Context, Formatter, Logger } from 'cordis'
import { appendFile, stat } from 'node:fs'
import { LOG_DIR } from '@/common/globalVars'
import { noop, Time } from 'cosmokit'
import { Exporter, Message } from 'cordis'
import { inspect } from 'node:util'
import { isDebugEnabled } from '@/common/logger'
import { logFilename, pruneOldLogs } from './logFiles'

declare module 'cordis' {
  interface Events {
    'llob/log': (record: LogRecord) => void
  }
}

export interface LogRecord {
  timestamp: number
  type: string
  content: string
  dateTimeStr: string
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_ENTRIES = 10000

const LOG_CACHE_SIZE = 800
const logCache: LogRecord[] = []

export function getLogCache(): LogRecord[] {
  return logCache
}

const inspectFormatter: Formatter = (value, target) => {
  return inspect(value, { colors: !!target.colors, depth: Infinity, compact: true, breakLength: Infinity })
}

export default class Log implements Exporter {
  static readonly name = 'log'

  exportFile: boolean
  currentFile: string
  currentEntries: number
  currentSize: number
  colors: number | false
  showTime: string
  levels: Record<string, number>
  maxLength?: number // 默认 10240
  label?: {
    width?: number
    margin?: number
    align?: 'left' | 'right'
  }
  formatters: Record<string, Formatter>

  constructor(public ctx: Context) {
    this.exportFile = true
    this.currentFile = path.join(LOG_DIR, logFilename())
    this.currentEntries = 0
    this.currentSize = 0
    pruneOldLogs(LOG_DIR).catch(noop)
    this.colors = false
    this.showTime = 'yyyy-MM-dd hh:mm:ss '
    // 2 = INFO, 3 = DEBUG; logLevel 的运行时切换见 main.ts applyDebugLevel
    this.levels = {
      default: isDebugEnabled() ? 3 : 2
    }
    this.formatters = {
      o: inspectFormatter,
      O: inspectFormatter,
    }

    stat(this.currentFile, (err, stats) => {
      if (!err && stats) {
        this.currentSize = stats.size
      }
    })

    ctx.on('llob/config-updated', input => {
      this.exportFile = input.log!
    })

    ctx.logger.exporter(this)
  }

  export(message: Message) {
    const dateTime = new Date(message.ts)
    const dateTimeStr = `${dateTime.getFullYear()}-${(dateTime.getMonth() + 1).toString().padStart(2, '0')}-${dateTime.getDate().toString().padStart(2, '0')} ${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}:${dateTime.getSeconds().toString().padStart(2, '0')}`

    const logRecord: LogRecord = {
      timestamp: message.ts,
      type: message.type,
      content: Logger.format(this, message),
      dateTimeStr,
    }

    logCache.push(logRecord)
    if (logCache.length > LOG_CACHE_SIZE) {
      logCache.shift()
    }

    this.ctx.parallel('llob/log', logRecord)

    if (!this.exportFile) return

    if (this.currentSize >= MAX_FILE_SIZE || this.currentEntries >= MAX_ENTRIES) {
      this.rotate()
    }

    try {
      const content = this.render(message) + '\n'
      appendFile(this.currentFile, content, noop)
      this.currentEntries++
      this.currentSize += Buffer.byteLength(content)
    } catch { }
  }

  // forked from https://github.com/cordiverse/cordis/blob/dd8bf6e838c8fc8fd661c09a6507d54e9fc46161/packages/logger-console/src/shared.ts#L69
  render(message: Message) {
    const prefix = `[${message.type[0].toUpperCase()}]`
    const space = ' '.repeat(this.label?.margin ?? 1)
    let indent = 3 + space.length, output = ''
    if (this.showTime) {
      indent += this.showTime.length
      output += Logger.color(this, 8, Time.template(this.showTime))
    }
    const code = Logger.code(message.name, this.colors)
    const label = Logger.color(this, code, message.name, ';1')
    const padLength = (this.label?.width ?? 0) + label.length - message.name.length
    if (this.label?.align === 'right') {
      output += label.padStart(padLength) + space + prefix + space
      indent += (this.label.width ?? 0) + space.length
    } else {
      output += prefix + space + label.padEnd(padLength) + space
    }
    output += Logger.format(this, message).replace(/\n/g, '\n' + ' '.repeat(indent))
    return output
  }

  rotate() {
    this.currentFile = path.join(LOG_DIR, logFilename())
    this.currentEntries = 0
    this.currentSize = 0
    pruneOldLogs(LOG_DIR).catch(noop)
  }
}
