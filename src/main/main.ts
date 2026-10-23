import path from 'node:path'

// fluent-ffmpeg 需要用到这个
globalThis.__dirname = import.meta.dirname
import Log from './log'
import Core from '../ntqqapi/core'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import Store from './store'
import { Config as LLBotConfig } from '../common/types'
import { Context } from 'cordis'
import {
  selfInfo, DATA_DIR, LOG_DIR, TEMP_DIR, dbDir, GLOBAL_PLUGINS_FILE, accountPluginsFile, ACCOUNTS_CONFIG_DIR, PLUGIN_DATA_DIR,
} from '../common/globalVars'
import {
  NTFileApi,
  NTFriendApi,
  NTGroupApi,
  NTLoginApi,
  NTMsgApi,
  NTUserApi,
  NTWebApi,
  NTSystemApi,
} from '../ntqqapi/api'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { version } from '../version'
import { WebuiServer } from '../webui/BE/server'
import { EmailConfig } from '@/common/emailConfig'
import { getPluginDirs, isPluginHmr, isPmhqMode } from '@/common/utils/environment'
import { setConfigLogLevel, isDebugEnabled, bindLoggerFactory, getLogger } from '@/common/logger'
import { pathToFileURL } from 'node:url'
import { DirectQQProtocolClient, PmhqQQProtocolClient } from './qqProtocol'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from './config'
import { migrateLegacyConfig } from './config/migrate'
import AccountService from './account'
import { startIpcServer, setLoginState } from './llbot-ipc'
import PluginService from '../plugin'
import BotsService from '../universal/bots'
import { builtinPlugins } from './builtins'
import { PluginRoutes } from '../webui/BE/routes/plugins'
import { DashboardRoutes, EmailRoutes } from '../webui/BE/routes'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLBotConfig) => void
    'llbot/email-config-updated': (input: EmailConfig) => void
  }
}

// 按当前 debug 状态 (--debug 或 config logLevel) 调整所有 logger exporter 的显示阈值:
// DEBUG(3) 才显示底层详情日志, 否则 INFO(2). config 热更新时重调.
function applyDebugLevel(ctx: Context): void {
  const level = isDebugEnabled() ? 3 : 2
  ctx.logger.exporters.forEach((exp) => {
    exp.levels = { ...exp.levels, default: level }
  })
}

async function onLoad() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR)
  }

  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR)
  }

  const pluginDir = path.join(DATA_DIR, 'plugins')
  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir)
  }

  // Dev-time move: the plugins config now lives under data/config/global/ (config-storage §3).
  const legacyPluginsFile = path.join(DATA_DIR, 'plugins.json')
  if (existsSync(legacyPluginsFile) && !existsSync(GLOBAL_PLUGINS_FILE)) {
    mkdirSync(path.dirname(GLOBAL_PLUGINS_FILE), { recursive: true })
    renameSync(legacyPluginsFile, GLOBAL_PLUGINS_FILE)
  }

  const ctx = new Context()

  ctx.plugin(Log)
  ctx.plugin(LoggerConsole, {
    // 2 = INFO(含 error/warn/info), 3 = DEBUG. --debug 启动即抬到 DEBUG; 配置文件 logLevel
    // 触发的运行时切换由 applyDebugLevel() 直接改各 exporter 的 levels.
    levels: {
      default: isDebugEnabled() ? 3 : 2
    }
  })
  // 让无 ctx 的底层模块 (client/sign/connection 等) 经 getLogger 也走统一 cordis logger
  bindLoggerFactory((name) => ctx.logger(name))
  // 一次性把旧的 config_<uin>.json / email_config.json 搬进 data/config/ (config-storage §9 step 5/6)
  migrateLegacyConfig(ctx.logger('config'))
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(BotsService)
  ctx.plugin(PluginService, {
    file: GLOBAL_PLUGINS_FILE,
    accountFile: accountPluginsFile,
    dataDir: PLUGIN_DATA_DIR,
    listAccounts: async () => {
      const entries = await readdir(ACCOUNTS_CONFIG_DIR, { withFileTypes: true }).catch(() => [])
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
    },
    roots: [pluginDir, ...getPluginDirs().map(dir => path.resolve(dir))],
    hmr: isPluginHmr(),
    builtins: builtinPlugins,
  })
  ctx.plugin(PluginRoutes)
  ctx.plugin(DashboardRoutes)
  ctx.plugin(EmailRoutes)
  // 模式二选一: PMHQ 走 WS/HTTP, Direct 走 native sign + TCP + WebUI 扫码.
  // 之后 ctx.qqProtocol 就是选中的实现, 上层代码不感知模式.
  ctx.plugin(isPmhqMode() ? PmhqQQProtocolClient : DirectQQProtocolClient)
  ctx.plugin(NTFileApi)
  ctx.plugin(NTFriendApi)
  ctx.plugin(NTGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTMsgApi)
  ctx.plugin(NTUserApi)
  ctx.plugin(NTWebApi)
  ctx.plugin(NTSystemApi)

  ctx.plugin(AccountService)

  // The config file and the database are per account, so everything here waits for the first login.
  // `account` survives reconnects, so this runs once and upper layers ride out short network drops.
  // The adapters, email notification and the neutral layer are builtin entries of the plugin service.
  ctx.inject(['account', 'config'], (ctx) => {
    const config = ctx.config.get(false)
    ctx.config.listenChange(c => {
      ctx.parallel('llob/config-updated', c)
    })
    ctx.parallel('llob/config-updated', config)
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: pathToFileURL(path.join(dbDir, `${ctx.account.uin}.v3.db`)).href,
    })
    ctx.plugin(Core, config)
    ctx.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire!,
    })
  })

  ctx.inject(['qqProtocol', 'config'], (ctx) => {
    ctx.logger.info(`LLBot ${version}`)
    ctx.logger.info(process.argv)
    const config = ctx.config.get()
    setConfigLogLevel(config.logLevel)
    applyDebugLevel(ctx)
    ctx.on('llob/config-updated', c => { setConfigLogLevel(c.logLevel); applyDebugLevel(ctx) })
    ctx.plugin(WebuiServer, config.webui)

    const handleOnline = async () => {
      console.log(`
  _                _            _     _ _ _ _
 | |    _   _  ___| | ___   _  | |   (_) | (_) __ _
 | |   | | | |/ __| |/ / | | | | |   | | | | |/ _\` |
 | |___| |_| | (__|   <| |_| | | |___| | | | | (_| |
 |_____|\\__,_|\\___|_|\\_\\\\__, | |_____|_|_|_|_|\\__,_|
                        |___/
                                        UIN: ${selfInfo.uin}
`)
      setLoginState({ state: 'logged_in', uin: selfInfo.uin, nickname: selfInfo.nick })
    }
    ctx.on('qq/online', handleOnline)
    // 协议层可能在 inject callback 之前就 emit 过 qq/online，那一次 emit 会丢，得 catch up 一下
    if (selfInfo.online && selfInfo.uid) {
      handleOnline()
    }

    ctx.on('llbot/self-nick-changed', (info) => {
      setLoginState({ nickname: info.nick })
    })

    ctx.on('protocol/disconnect', () => {
      ctx.logger.info('协议层断开，等待重连…')
    })

    // 两种模式都启动 IPC server: Desktop 统一通过 IPC 拿 uin/昵称
    startIpcServer()
    setLoginState({ state: 'initializing' })
    // 具体登录流程 (PMHQ 探测 / Direct 扫码 loop) 都在 impl 的 Service.init 里跑, main.ts 不管
  })

  // 全局兜底：单个 orphaned rejection / 未捕获异常不该拖垮整个 bot 进程。
  // 典型来源见 ntMsgApi.sendMsg：群发失败提前 throw 后，echoP 的 7s timer 仍会 reject。
  // 这里只 log 不退出（保 bot 存活）；若想让 docker 拉起干净进程可改成 process.exit(1)。
  process.on('unhandledRejection', (reason) => {
    ctx.logger.error('[unhandledRejection]', reason)
  })
  process.on('uncaughtException', (err) => {
    ctx.logger.error('[uncaughtException]', err)
  })
}

onLoad().catch(e => getLogger('main').error(e))
