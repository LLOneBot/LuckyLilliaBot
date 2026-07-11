import { Logger, defaultFormatters } from 'cordis'

// %h: Buffer -> hex 字符串. cordis 只在 exporter 真正要输出 (level 通过) 时才调格式化符, 所以
// logger.debug(`frame hex=%h`, buf) 里的 hex 是惰性的 —— 关着 debug 时根本不会算. 全局注册一次,
// 所有 exporter (console + 日志文件) 共用 (见 cordis logger.format: exporter.formatters ?? defaultFormatters)。
defaultFormatters.h = (value: unknown) =>
  Buffer.isBuffer(value) ? value.toString('hex') : value == null ? '' : String(value)

// debug 详情总开关: 命令行 --debug 或配置文件 logLevel === 'debug'. main 据此把 exporter level 抬到 DEBUG。
const DEBUG_ARGV = process.argv.includes('--debug')
let configDebug = false
let makeLogger: ((name: string) => Logger) | undefined
const cache = new Map<string, Logger>()

export function isDebugEnabled(): boolean {
  return DEBUG_ARGV || configDebug
}

/** config 加载 / 热更新时同步进来. logLevel 目前只区分 'info' (默认) 与 'debug'. */
export function setConfigLogLevel(level: string | undefined): void {
  configDebug = level === 'debug'
}

/** main 启动时注入 ctx.logger 工厂. 之后无 ctx 的模块经 getLogger 也能走统一 cordis logger。 */
export function bindLoggerFactory(factory: (name: string) => Logger): void {
  makeLogger = factory
}

/**
 * 给拿不到 ctx.logger 的模块 (client / sign / connection 等) 用的命名空间 logger。
 * 返回稳定句柄, 每次调用时才解析真 logger (模块 import 时工厂常还没注入); 注入前退回 console。
 * 用法与 ctx.logger 一致: logger.info(...) / logger.warn(...) / logger.error(...) / logger.debug(`...%h`, buf)。
 */
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

// 工厂注入前 (启动极早期) 的兜底. %h 等格式化符不处理, 但这一窗口几乎不会打日志。
function consoleShim(namespace: string): Logger {
  const p = `[${namespace}]`
  return {
    error: (...a: unknown[]) => console.error(p, ...a),
    warn: (...a: unknown[]) => console.warn(p, ...a),
    info: (...a: unknown[]) => console.info(p, ...a),
    debug: (...a: unknown[]) => { if (isDebugEnabled()) console.debug(p, ...a) },
  } as unknown as Logger
}
