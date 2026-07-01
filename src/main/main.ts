import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import QRCode from 'qrcode'

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
import { sleep } from '@/common/utils'
import EmailNotificationService from '@/common/emailNotification'
import { EmailConfig } from '@/common/emailConfig'
import { isDockerEnvironment } from '@/common/utils/environment'
import { pathToFileURL } from 'node:url'
import { QQProtocolClient } from './qqProtocol'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from './config'
import { startIpcServer, setLoginState, getCurrentLoginState } from './llbot-ipc'

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
  ctx.plugin(QQProtocolClient)
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

  let lastQrCodeTime = 0

  const isDocker = isDockerEnvironment()
  const useDirectProtocol = !process.env.QQ_USE_PMHQ

  const printLoginQrCode = async () => {
    try {
      const data = await ctx.qqProtocol.getDirectLoginQrCode()

      // 推给 Desktop (无头模式扫码登录对话框)
      setLoginState({ state: 'need_qrcode', qrcode_png_base64: data.pngBase64QrcodeData })

      const qrText = await QRCode.toString(data.qrcodeUrl, { type: 'terminal', small: true })
      console.log('\n========== 请使用手机QQ扫描二维码登录 ==========')
      console.log(qrText)
      console.log('================================================\n')

      if (data.pngBase64QrcodeData) {
        const base64Data = data.pngBase64QrcodeData.replace(/^data:image\/png;base64,/, '')
        const qrFilePath = path.join(TEMP_DIR, 'login-qrcode.png')
        if (!existsSync(TEMP_DIR)) {
          mkdirSync(TEMP_DIR, { recursive: true })
        }
        await writeFile(qrFilePath, Buffer.from(base64Data, 'base64'))
        ctx.logger.info(`二维码文件已保存: ${qrFilePath}`)
      }

      const qrWebUrl = `https://api.2dcode.biz/v1/create-qr-code?data=${encodeURIComponent(data.qrcodeUrl)}`
      ctx.logger.info(`或浏览器打开二维码网址: ${qrWebUrl}`)
    } catch (e) {
      ctx.logger.warn('获取登录二维码失败', e)
    }
  }

  const directLoginLoop = async () => {
    if (selfInfo.online) return
    const info = ctx.qqProtocol.getDirectSelfInfo()
    if (!info.online) {
      const now = Date.now()
      // 二维码过期 / 被取消时立即重新获取 (Desktop 扫码界面才能及时刷新), 否则按 120s 节流刷新
      const st = getCurrentLoginState().state
      const needRefresh = st === 'expired' || st === 'cancelled'
      if (needRefresh || now - lastQrCodeTime > 120_000) {
        lastQrCodeTime = now
        printLoginQrCode()
      }
      setTimeout(directLoginLoop, 1000)
    }
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
      // 直连模式登录后 nick 可能为空 (session 无 nick / TLV 0x11A 缺失), 异步补查后更新给 Desktop
      if (useDirectProtocol && !selfInfo.nick) {
        ctx.inject(['ntUserApi'], async (userCtx) => {
          try {
            const nick = await userCtx.ntUserApi.getSelfNick(true)
            if (nick) {
              selfInfo.nick = nick
              setLoginState({ nickname: nick })
            }
          } catch (e) {
            ctx.logger.warn('补查登录号昵称失败', e)
          }
        })
      }
      if (!sessionLoaded) {
        config = ctx.config.get(false)
        ctx.config.listenChange(c => {
          ctx.parallel('llob/config-updated', c)
        })
        ctx.parallel('llob/config-updated', config)
      }
      loadPluginAfterLogin()
    }
    ctx.on('qq/online', () => {
      if (selfInfo.uid) {
        handleOnline()
      } else {
        ctx.inject(['ntFriendApi'], async (ctx) => {
          const info = (await ctx.ntFriendApi.getFriends(false)).friends.find(e => e.isSelf)
          selfInfo.uid = info!.uid
          selfInfo.uin = info!.uin.toString()
          selfInfo.nick = info!.nick
          handleOnline()
        })
      }
    })
    // 协议层可能在 inject callback 之前就 emit 过 qq/online，那一次 emit 会丢，得 catch up 一下
    if (selfInfo.online && selfInfo.uid) {
      handleOnline()
    } else if (selfInfo.online) {
      ctx.inject(['ntFriendApi'], async (ctx) => {
        const info = (await ctx.ntFriendApi.getFriends(false)).friends.find(e => e.isSelf)
        selfInfo.uid = info!.uid
        selfInfo.uin = info!.uin.toString()
        selfInfo.nick = info!.nick
        handleOnline()
      })
    }

    ctx.on('protocol/disconnect', () => {
      ctx.logger.info('协议层断开，等待重连…')
    })

    // 两种模式都启动 IPC server: Desktop 统一通过 IPC 拿 uin/昵称 (有头 PMHQ 模式也需要)
    startIpcServer()
    setLoginState({ state: 'initializing' })
    if (useDirectProtocol) {
      ctx.qqProtocol.initDirectClient().then(() => {
        directLoginLoop()
      }).catch(e => {
        // 不 catch 的话 reject 会变成 unhandled rejection, directLoginLoop 不跑,
        // 状态停在 initializing, Desktop 一直显示"登录中"却没有任何线索.
        ctx.logger.error('直连协议初始化失败 (initDirectClient):', e)
      })
    } else {
      ctx.qqProtocol.startHook()
    }
  })
}


onLoad().catch(e => console.error(e))
