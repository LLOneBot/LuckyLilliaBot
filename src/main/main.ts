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
import Database from 'minato'
import SQLiteDriver from '@minatojs/driver-sqlite'
import Store from './store'
import { Config as LLBotConfig } from '../common/types'
import { Context } from 'cordis'
import { selfInfo, LOG_DIR, TEMP_DIR, dbDir } from '../common/globalVars'
import {
  NTQQFileApi,
  NTQQFileCacheApi,
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
import { PMHQ } from './pmhq'
import LoggerService from '@cordisjs/plugin-logger'
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

  const ctx = new Context()

  ctx.plugin(LoggerService)
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(PMHQ)
  ctx.plugin(NTQQFileApi)
  ctx.plugin(NTQQFileCacheApi)
  ctx.plugin(NTQQFriendApi)
  ctx.plugin(NTQQGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTQQMsgApi)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQWebApi)
  ctx.plugin(NTQQSystemApi)

  let config: LLBotConfig

  const loadPluginAfterLogin = () => {
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

  const isDocker = isDockerEnvironment()
  let qrCodeTriggered = false

  const printLoginQrCode = async () => {
    try {
      const data = await ctx.ntLoginApi.getLoginQrCode()

      const qrText = await QRCode.toString(data.qrcodeUrl, { type: 'terminal', small: true })
      console.log('\n========== 请使用手机QQ扫描二维码登录 ==========')
      console.log(qrText)
      console.log('================================================\n')

      const base64Data = data.pngBase64QrcodeData.replace(/^data:image\/png;base64,/, '')
      const qrFilePath = path.join(TEMP_DIR, 'login-qrcode.png')
      if (!existsSync(TEMP_DIR)) {
        mkdirSync(TEMP_DIR, { recursive: true })
      }
      await writeFile(qrFilePath, Buffer.from(base64Data, 'base64'))
      ctx.logger.info(`二维码文件已保存: ${qrFilePath}`)

      const qrWebUrl = `https://api.2dcode.biz/v1/create-qr-code?data=${encodeURIComponent(data.qrcodeUrl)}`
      ctx.logger.info(`或浏览器打开二维码网址: ${qrWebUrl}`)
    } catch (e) {
      ctx.logger.warn('获取登录二维码失败', e)
    }
  }

  const checkLogin = async () => {
    let pmhqSelfInfo = { ...selfInfo }
    try {
      pmhqSelfInfo = await ctx.pmhq.call('getSelfInfo', [])
    } catch (e) {
      ctx.logger.info('获取账号信息状态失败', e)
      setTimeout(checkLogin, 1000)
      return
    }
    if (!pmhqSelfInfo.online) {
      if (isDocker && !qrCodeTriggered) {
        qrCodeTriggered = true
        printLoginQrCode()
      }
      setTimeout(checkLogin, 1000)
      return
    }
    selfInfo.uin = pmhqSelfInfo.uin
    selfInfo.uid = pmhqSelfInfo.uid
    selfInfo.nick = pmhqSelfInfo.nick
    if (!selfInfo.uin) {
      for (let i = 0; i < 5; i++) {
        try {
          selfInfo.uin = await ctx.ntUserApi.getUinByUid(selfInfo.uid)
          break
        } catch (e) {
          await sleep(1000)
        }
      }
    }
    selfInfo.online = true
    if (!selfInfo.nick) {
      await ctx.ntUserApi.getSelfNick(true).catch(e => {
        ctx.logger.warn('获取登录号昵称失败', e)
      })
    }
    config = ctx.config.get(false)
    ctx.config.listenChange(c => {
      ctx.parallel('llob/config-updated', c)
    })
    ctx.parallel('llob/config-updated', config)
    loadPluginAfterLogin()
  }

  ctx.inject(['logger'], (ctx) => {
    ctx.logger.exporter(new Log(ctx, true))
    ctx.logger.info(`LLBot ${version}`)
  })
  // setFFMpegPath(config.ffmpeg || '')
  ctx.inject(['pmhq', 'config', 'logger'], (ctx) => {
    config = ctx.config.get()
    config.milky.enable = false
    config.satori.enable = false
    config.ob11.enable = false
    ctx.plugin(WebuiServer, config.webui)
    checkLogin()
    ctx.pmhq.startHook()
  })
}


try {
  onLoad().then().catch(e => console.log(e))
} catch (e) {
  console.error(e)
}
