import { Logger, defaultFormatters } from 'cordis'

// %h: Buffer -> hex. cordis 只在 level 通过时才调格式化符, 关着 debug 不会算 hex
defaultFormatters.h = (value: unknown) =>
  Buffer.isBuffer(value) ? value.toString('hex') : value == null ? '' : String(value)

const DEBUG_ARGV = process.argv.includes('--debug')
const LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 }
let configLevel = LEVELS.info
let makeLogger: ((name: string) => Logger) | undefined
const cache = new Map<string, Logger>()

export function isDebugEnabled(): boolean {
  return getLogLevel() === LEVELS.debug
}

export function getLogLevel(): number {
  return DEBUG_ARGV ? LEVELS.debug : configLevel
}

export function setConfigLogLevel(level: string | undefined): void {
  configLevel = level !== undefined && Object.hasOwn(LEVELS, level) ? LEVELS[level] : LEVELS.info
}

export function bindLoggerFactory(factory: (name: string) => Logger): void {
  makeLogger = factory
}

/** 给拿不到 ctx 的模块用。每次调用才解析真 logger: 模块 import 时工厂多半还没注入 */
export function getLogger(namespace: string): Logger {
  const forward = (level: 'error' | 'warn' | 'info' | 'debug') =>
    (...args: unknown[]) => (resolve(namespace)[level] as (...a: unknown[]) => void)(...args)
  return {
    error: forward('error'),
    warn: forward('warn'),
    info: forward('info'),
    debug: forward('debug'),
  } as unknown as Logger
}

function resolve(namespace: string): Logger {
  const factory = makeLogger
  if (!factory) return consoleShim(namespace)
  let lg = cache.get(namespace)
  if (!lg) {
    lg = factory(namespace)
    cache.set(namespace, lg)
  }
  return lg
}

// 工厂注入前的兜底, 不处理 %h
function consoleShim(namespace: string): Logger {
  const p = `[${namespace}]`
  return {
    error: (...a: unknown[]) => console.error(p, ...a),
    warn: (...a: unknown[]) => { if (getLogLevel() >= LEVELS.warn) console.warn(p, ...a) },
    info: (...a: unknown[]) => { if (getLogLevel() >= LEVELS.info) console.info(p, ...a) },
    debug: (...a: unknown[]) => { if (isDebugEnabled()) console.debug(p, ...a) },
  } as unknown as Logger
}
