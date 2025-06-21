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
import { getConfigUtil } from '../common/config'
import { Context } from 'cordis'
import { llonebotError, selfInfo, LOG_DIR, DATA_DIR, TEMP_DIR } from '../common/globalVars'
import { logFileName } from '../common/utils/legacyLog'
import {
  NTQQFileApi,
  NTQQFileCacheApi,
  NTQQFriendApi,
  NTQQGroupApi,
  NTQQMsgApi,
  NTQQUserApi,
  NTQQWebApi,
  NTQQSystemApi,
} from '../ntqqapi/api'
import { existsSync, mkdirSync } from 'node:fs'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { version } from '../version'
import { WebUIServer } from '../webui/BE/server'

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
  ctx.plugin(NTQQMsgApi)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQWebApi)
  ctx.plugin(NTQQSystemApi)
  ctx.plugin(Database)

  let started = false

  ctx.logger.info(`LLOneBot ${version}`)
  const pmhqSelfInfo = await pmhq.call('getSelfInfo', [])
  const self = Object.assign(selfInfo, {
    uin: pmhqSelfInfo.uin,
    uid: pmhqSelfInfo.uid,
    online: true,
  })
  ctx.ntUserApi.getUserDetailInfo(self.uid).then(userInfo => {
    self.nick = userInfo.simpleInfo.coreInfo.nick
  }).catch(ctx.logger.error)
  // log('process pid', process.pid)
  const configUtil = getConfigUtil()
  const config = configUtil.getConfig()
  configUtil.listenChange(c => {
    ctx.parallel('llob/config-updated', c)
  })

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
  if (config.ob11.enable) {
    ctx.plugin(OneBot11Adapter, {
      ...config.ob11,
      onlyLocalhost: config.onlyLocalhost,
      heartInterval: config.heartInterval,
      debug: config.debug!,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url!,
      ffmpeg: config.ffmpeg,
    })
  }
  if (config.satori.enable) {
    ctx.plugin(SatoriAdapter, {
      ...config.satori,
      ffmpeg: config.ffmpeg,
      onlyLocalhost: config.onlyLocalhost,
    })
  }
  ctx.plugin(WebUIServer, {...config.webui, onlyLocalhost: config.onlyLocalhost})

  ctx.start()
  started = true
  llonebotError.otherError = ''
}


try {
  onLoad().then()
} catch (e) {
  console.log(e)
}
