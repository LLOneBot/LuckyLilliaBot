import path from 'node:path'

// fluent-ffmpeg 需要用到这个
globalThis.__dirname = import.meta.dirname
import Log from './log'
import Core from '../ntqqapi/core'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import MilkyAdapter from '../milky/adapter'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import Store from './store'
import { Config as LLBotConfig } from '../common/types'
import { Context } from 'cordis'
import { selfInfo, LOG_DIR, TEMP_DIR, dbDir } from '../common/globalVars'
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
import { existsSync, mkdirSync } from 'node:fs'
import { version } from '../version'
import { WebuiServer } from '../webui/BE/server'
import EmailNotificationService from '@/common/emailNotification'
import { EmailConfig } from '@/common/emailConfig'
import { isPmhqMode } from '@/common/utils/environment'
import { pathToFileURL } from 'node:url'
import { DirectQQProtocolClient, PmhqQQProtocolClient } from './qqProtocol'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from './config'
import { startIpcServer, setLoginState } from './llbot-ipc'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLBotConfig) => void
    'llbot/email-config-updated': (input: EmailConfig) => void
  }
}

async function onLoad() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR)
  }

  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR)
  }

  const ctx = new Context()

  ctx.plugin(Log)
  ctx.plugin(LoggerConsole, {
    levels: {
      default: 2
    }
  })
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
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

  let config: LLBotConfig
  // 上层会话插件只加载一次，重连后不重新加载（断线时上层服务希望透明渡过短时断网）
  let sessionLoaded = false

  const loadPluginAfterLogin = () => {
    if (sessionLoaded) return
    sessionLoaded = true
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: pathToFileURL(path.join(dbDir, `${selfInfo.uin}.v3.db`)).href,
    })
    ctx.plugin(Core, config)
    ctx.plugin(OneBot11Adapter, {
      ...config.ob11,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url!,
      ffmpeg: config.ffmpeg,
    })
    ctx.plugin(SatoriAdapter, {
      ...config.satori,
      ffmpeg: config.ffmpeg,
    })
    ctx.plugin(MilkyAdapter, config.milky)
    ctx.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire!,
    })
    ctx.plugin(EmailNotificationService)
  }

  ctx.inject(['qqProtocol', 'config'], (ctx) => {
    ctx.logger.info(`LLBot ${version}`)
    ctx.logger.info(process.argv)
    config = ctx.config.get()
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
      if (!sessionLoaded) {
        config = ctx.config.get(false)
        ctx.config.listenChange(c => {
          ctx.parallel('llob/config-updated', c)
        })
        ctx.parallel('llob/config-updated', config)
      }
      loadPluginAfterLogin()
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

onLoad().catch(e => console.error(e))
