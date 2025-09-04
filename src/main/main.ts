import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = typeof window === 'undefined'
  ? path.dirname(fileURLToPath(import.meta.url))
  : ''
global.__dirname = __dirname
import Log from './log'
import Core from '../ntqqapi/core'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import Database from 'minato'
import SQLiteDriver from '@minatojs/driver-sqlite'
import Store from './store'
import { Config as LLOBConfig } from '../common/types'
import { startHook } from '../ntqqapi/hook'
import { defaultConfig, getConfigUtil } from '../common/config'
import { Context } from 'cordis'
import { llonebotError, selfInfo, LOG_DIR, DATA_DIR, TEMP_DIR } from '../common/globalVars'
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
import { setFFMpegPath } from '@/common/utils/ffmpeg'
import { pmhq } from '@/ntqqapi/native/pmhq'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLOBConfig) => void
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

  const dbDir = path.join(DATA_DIR, 'database')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir)
  }

  const ctx = new Context()

  ctx.plugin(NTQQFileApi)
  ctx.plugin(NTQQFileCacheApi)
  ctx.plugin(NTQQFriendApi)
  ctx.plugin(NTQQGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTQQMsgApi)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQWebApi)
  ctx.plugin(NTQQSystemApi)
  ctx.plugin(Database)

  let started = false
  const pmhqSelfInfo: {uin: string, uid: string, online: boolean} = await pmhq.call('getSelfInfo', [])
  let config = defaultConfig
  if (pmhqSelfInfo.online){
    selfInfo.uin = pmhqSelfInfo.uin
    selfInfo.uid = pmhqSelfInfo.uid
    selfInfo.online = true
    ctx.ntUserApi.getUserSimpleInfo(selfInfo.uid).then(userInfo => {
      selfInfo.nick = userInfo.coreInfo.nick
    })
    config = getConfigUtil().getConfig()
    getConfigUtil().listenChange(c=>{
      ctx.parallel('llob/config-updated', c)
    })
  }
  else{
    config = defaultConfig
    config.satori.enable = false
    config.ob11.enable = false
  }
  ctx.logger.info(`LLOneBot ${version}`)
  // setFFMpegPath(config.ffmpeg || '')
  startHook()

  ctx.plugin(Log, {
    enable: config.log!,
    filename: logFileName,
  })
  ctx.plugin(SQLiteDriver, {
    path: path.join(dbDir, `${selfInfo.uin}.db`),
  })
  ctx.plugin(Store, {
    msgCacheExpire: config.msgCacheExpire! * 1000,
  })
  ctx.plugin(Core, config)
  ctx.plugin(OneBot11Adapter, {
    ...config.ob11,
    onlyLocalhost: config.onlyLocalhost,
    heartInterval: config.heartInterval,
    debug: config.debug!,
    musicSignUrl: config.musicSignUrl,
    enableLocalFile2Url: config.enableLocalFile2Url!,
    ffmpeg: config.ffmpeg,
  })
  ctx.plugin(SatoriAdapter, {
    ...config.satori,
    ffmpeg: config.ffmpeg,
    onlyLocalhost: config.onlyLocalhost,
  })
  ctx.plugin(WebUIServer, {...config.webui, onlyLocalhost: config.onlyLocalhost})

  ctx.start()
  started = true
  llonebotError.otherError = ''
}


try {
  onLoad().then().catch(e => console.log(e))
}catch (e) {
  console.error(e)
}
