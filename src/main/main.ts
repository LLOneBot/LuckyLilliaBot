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
  NTQQFileApi,
  NTQQFriendApi,
  NTQQGroupApi,
  NTLoginApi,
  NTQQMsgApi,
  NTQQUserApi,
  NTQQWebApi,
  NTQQSystemApi,
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

  const ctx = new Context().intercept('logger', { level: 2 })

  ctx.plugin(Log)
  ctx.plugin(LoggerConsole)
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(QQProtocolClient)
  ctx.plugin(NTQQFileApi)
  ctx.plugin(NTQQFriendApi)
  ctx.plugin(NTQQGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTQQMsgApi)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQWebApi)
  ctx.plugin(NTQQSystemApi)

  let config: LLBotConfig
  // 上层会话插件只加载一次，重连后不重新加载（断线时上层服务希望透明渡过短时断网）
  let sessionLoaded = false

  const loadPluginAfterLogin = () => {
    if (sessionLoaded) return
    sessionLoaded = true
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: pathToFileURL(path.join(dbDir, `${selfInfo.uin}.v2.db`)).href,
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
      if (now - lastQrCodeTime > 120_000) {
        lastQrCodeTime = now
        printLoginQrCode()
      }
      setTimeout(directLoginLoop, 1000)
    }
  }

  const ensurePmhqMissingFields = async (userCtx: Context) => {
    if (!selfInfo.uid && selfInfo.uin) {
      for (let i = 0; i < 5; i++) {
        try {
          selfInfo.uid = String(await userCtx.ntUserApi.getUidByUin(+selfInfo.uin))
          if (selfInfo.uid) break
        } catch (e) {
          await sleep(1000)
        }
      }
    }
    if (!selfInfo.uin && selfInfo.uid) {
      for (let i = 0; i < 5; i++) {
        try {
          selfInfo.uin = String(await userCtx.ntUserApi.getUinByUid(selfInfo.uid))
          if (selfInfo.uin) break
        } catch (e) {
          await sleep(1000)
        }
      }
    }
    if (!selfInfo.nick && selfInfo.uid) {
      await userCtx.ntUserApi.getSelfNick(true).catch(e => {
        userCtx.logger.warn('获取登录号昵称失败', e)
      })
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
    if (selfInfo.online && (selfInfo.uid || selfInfo.uin)) {
      handleOnline()
    }

    // PMHQ 模式：plugin 加载完后 ntUserApi 才就绪，那时再补 uid/nick
    if (!useDirectProtocol) {
      ctx.inject(['ntUserApi'], async (userCtx) => {
        if (selfInfo.online) {
          await ensurePmhqMissingFields(userCtx)
        }
      })
    }

    ctx.on('protocol/disconnect', () => {
      ctx.logger.info('协议层断开，等待重连…')
    })

    if (useDirectProtocol) {
      ctx.qqProtocol.initDirectClient().then(() => {
        directLoginLoop()
      })
    } else {
      ctx.qqProtocol.startHook()
    }
  })
}


try {
  onLoad().then().catch(e => console.log(e))
} catch (e) {
  console.error(e)
}
