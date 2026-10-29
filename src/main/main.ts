import path from 'node:path'

// fluent-ffmpeg 需要用到这个
globalThis.__dirname = import.meta.dirname
import Log from './log'
import { Config as LLBotConfig } from '../common/types'
import { Context } from 'cordis'
import { DATA_DIR, LOG_DIR, TEMP_DIR } from '../common/globalVars'
import { existsSync, mkdirSync } from 'node:fs'
import { version } from '../version'
import { WebuiServer } from '../webui/BE/server'
import { getPluginDirs, isPluginHmr } from '@/common/utils/environment'
import { setConfigLogLevel, isDebugEnabled, bindLoggerFactory, getLogger } from '@/common/logger'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from './config'
import { liftBuiltinSettings, migrateToInstances } from './config/migrate'
import { lockInstance } from './instanceLock'
import { currentInstance, InstanceChoice } from '@/common/instance'
import { configPaths } from '@/common/configPaths'
import PluginService from '../plugin/host'
import BotsService from '../universal/bots'
import { builtinPlugins } from '../plugin/internal'
import { PluginRoutes } from '../webui/BE/routes/plugins'
import { DashboardRoutes } from '../webui/BE/routes'
import { EmailRoutes } from '../plugin/internal/tool/email-notification/testRoutes'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLBotConfig) => void
  }
}

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

  const ctx = new Context()

  // Awaited: until their exporters are in, log lines go nowhere (the migration below logs what it moved)
  await ctx.plugin(Log)
  await ctx.plugin(LoggerConsole, {
    // 2 = INFO, 3 = DEBUG
    levels: {
      default: isDebugEnabled() ? 3 : 2
    }
  })
  bindLoggerFactory((name) => ctx.logger(name))
  // Before the instance is picked: it may create the one `-q` points to (config-storage §9)
  migrateToInstances(ctx.logger('config'))
  let instance: InstanceChoice
  try {
    instance = currentInstance()
    await lockInstance(instance.name)
    // Under the lock, so two processes cannot both rewrite this instance's files
    liftBuiltinSettings(ctx.logger('config'))
  } catch (e) {
    ctx.logger('main').error((e as Error).message)
    process.exit(1)
  }
  ctx.logger('main').info(`实例 ${instance.name}（${instance.reason}），配置在 ${configPaths.instance()}`)
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(BotsService)
  // The scanned account (builtin:nt-protocol) and the official bot are entries here, like the adapters
  ctx.plugin(PluginService, {
    file: configPaths.plugins(),
    dataDir: configPaths.pluginData(),
    roots: [pluginDir, ...getPluginDirs().map(dir => path.resolve(dir))],
    hmr: isPluginHmr(),
    builtins: builtinPlugins,
  })
  // The shell: up without any protocol, so the plugin page can switch protocols on and off
  ctx.plugin(WebuiServer)
  ctx.plugin(PluginRoutes)
  ctx.plugin(DashboardRoutes)
  ctx.plugin(EmailRoutes)

  // The settings are the instance's, fixed at startup: applied now and watched from here on
  ctx.inject(['config'], (ctx) => {
    ctx.logger.info(`LLBot ${version}`)
    ctx.logger.info(process.argv)
    const config = ctx.config.get()
    setConfigLogLevel(config.logLevel)
    applyDebugLevel(ctx)
    ctx.on('llob/config-updated', c => { setConfigLogLevel(c.logLevel); applyDebugLevel(ctx) })
    ctx.config.listenChange(c => {
      ctx.parallel('llob/config-updated', c)
    })
    // The log file switch is only ever applied from this event
    ctx.parallel('llob/config-updated', config)
  })

  // 只 log 不退出: 一个 orphaned rejection (如 sendMsg 提前 throw 后 echoP 的 timer) 不该拖垮整个进程
  process.on('unhandledRejection', (reason) => {
    ctx.logger.error('[unhandledRejection]', reason)
  })
  process.on('uncaughtException', (err) => {
    ctx.logger.error('[uncaughtException]', err)
  })
}

onLoad().catch(e => getLogger('main').error(e))
