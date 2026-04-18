import path from 'node:path'
import { Context } from 'cordis'
import { appendFile, stat } from 'node:fs'
import { LOG_DIR } from '@/common/globalVars'
import { noop } from 'cosmokit'
import { Exporter, Message } from '@cordisjs/plugin-logger'

// 日志切片配置
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_ENTRIES = 10000

function generateLogFilename(): string {
  return `llbot-${new Date().toLocaleString('zh-CN')}.log`.replace(/\//g, '-').replace(/:/g, '-')
}

export interface LogRecord {
  timestamp: number
  type: string
  content: string
  dateTimeStr: string
}

// 日志缓存
const LOG_CACHE_SIZE = 1000
const logCache: LogRecord[] = []

export function getLogCache(): LogRecord[] {
  return logCache
}

declare module 'cordis' {
  interface Events {
    'llob/log': (record: LogRecord) => void
  }
}

export default class Log implements Exporter {
  private exporterConsole: Exporter.Console
  private currentFile: string
  private currentEntries: number
  private currentSize: number

  constructor(private ctx: Context, private exportFile: boolean) {
    this.exporterConsole = new Exporter.Console({
      timestamp: Date.now(),
      colors: 0
    })
    this.currentFile = path.join(LOG_DIR, generateLogFilename())
    this.currentEntries = 0
    this.currentSize = 0

    // 获取现有文件大小
    stat(this.currentFile, (err, stats) => {
      if (!err && stats) {
        this.currentSize = stats.size
      }
    })

    ctx.on('llob/config-updated', input => {
      this.exportFile = input.log!
    })
  }

  export(message: Message) {
    const dateTime = new Date(message.ts)
    const dateTimeStr = `${dateTime.getFullYear()}-${(dateTime.getMonth() + 1).toString().padStart(2, '0')}-${dateTime.getDate().toString().padStart(2, '0')} ${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}:${dateTime.getSeconds().toString().padStart(2, '0')}`

    const logRecord: LogRecord = {
      timestamp: message.ts,
      type: message.type,
      content: message.body,
      dateTimeStr,
    }

    // 缓存日志
    logCache.push(logRecord)
    if (logCache.length > LOG_CACHE_SIZE) {
      logCache.shift()
    }

    // 发送日志事件到 SSE
    this.ctx.parallel('llob/log', logRecord)

    if (!this.exportFile) return

    // 检查是否需要切片
    if (this.currentSize >= MAX_FILE_SIZE || this.currentEntries >= MAX_ENTRIES) {
      this.rotate()
    }

    const content = this.render(message) + '\n'

    appendFile(this.currentFile, content, noop)
    this.currentEntries++
    this.currentSize += Buffer.byteLength(content)
  }

  render(message: Message) {
    return this.exporterConsole.render(message)
  }

  rotate() {
    this.currentFile = path.join(LOG_DIR, generateLogFilename())
    this.currentEntries = 0
    this.currentSize = 0
  }
}
