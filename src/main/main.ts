import path from 'node:path'

// 全局异常处理，防止未捕获的异常导致程序崩溃
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

import Log from './log'
import Core from '../ntqqapi/core'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import MilkyAdapter from '../milky/adapter'
import Database from 'minato'
import SQLiteDriver from '@minatojs/driver-sqlite'
import Store from './store'
import { Config as LLOBConfig } from '../common/types'
import { startHook } from '../ntqqapi/hook'
import { getConfigUtil } from '../common/config'
import { Context } from 'cordis'
import { selfInfo, LOG_DIR, DATA_DIR, TEMP_DIR, dbDir } from '../common/globalVars'
import { logFileName } from '../common/utils/legacyLog'
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
import { WebUIServer } from '../webui/BE/server'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { sleep } from '@/common/utils'
import EmailNotificationService from '@/common/emailNotification'
import { EmailConfig } from '@/common/emailConfig'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLOBConfig) => void
    'llbot/email-config-updated': (input: EmailConfig) => void
  }
}


async function onLoad() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR)
  }

  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR)
  }
  const ctx = new Context()

  let config = getConfigUtil().getConfig()
  config.milky.enable = false
  config.satori.enable = false
  config.ob11.enable = false
  ctx.plugin(NTQQFileApi)
  ctx.plugin(NTQQFileCacheApi)
  ctx.plugin(NTQQFriendApi)
  ctx.plugin(NTQQGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTQQMsgApi)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQWebApi)
  ctx.plugin(NTQQSystemApi)
  ctx.plugin(Log, {
    enable: config.log!,
    filename: logFileName,
  })
  ctx.plugin(WebUIServer, config.webui)

  const loadPluginAfterLogin = () => {
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: path.join(dbDir, `${selfInfo.uin}.v2.db`),
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

  const checkLogin = async () => {
    let pmhqSelfInfo = { ...selfInfo }
    try {
      pmhqSelfInfo = await pmhq.call('getSelfInfo', [])
    } catch (e) {
      ctx.logger.info('获取账号信息状态失败', e)
      setTimeout(checkLogin, 1000)
      return
    }
    if (!pmhqSelfInfo.online) {
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
    config = getConfigUtil(true).getConfig()
    getConfigUtil().listenChange(c => {
      ctx.parallel('llob/config-updated', c)
    })
    ctx.parallel('llob/config-updated', config)
    loadPluginAfterLogin()
  }
  checkLogin()

  ctx.logger.info(`LLBot ${version}`)
  // setFFMpegPath(config.ffmpeg || '')
  startHook()
  ctx.start().catch(e => {
    console.error('Start error:', e)
  })
}


try {
  onLoad().then().catch(e => console.log(e))
} catch (e) {
  console.error(e)
}
