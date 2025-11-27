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
import { ReceiveCmdS, registerReceiveHook, startHook } from '../ntqqapi/hook'
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
import { setFFMpegPath } from '@/common/utils/ffmpeg'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { defaultConfig } from '@/common/defaultConfig'
import { sleep } from '@/common/utils'

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
  const ctx = new Context()

  let config = getConfigUtil().getConfig()
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
  ctx.plugin(WebUIServer, { ...config.webui, onlyLocalhost: config.onlyLocalhost })

  const loadPluginAfterLogin = () => {
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: path.join(dbDir, `${selfInfo.uin}.v2.db`),
    })
    ctx.plugin(Core, config)
    ctx.plugin(OneBot11Adapter, {
      ...config.ob11,
      onlyLocalhost: config.onlyLocalhost,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url!,
      ffmpeg: config.ffmpeg,
    })
    ctx.plugin(SatoriAdapter, {
      ...config.satori,
      ffmpeg: config.ffmpeg,
      onlyLocalhost: config.onlyLocalhost,
    })
    ctx.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire! * 1000,
    })
  }

  let pmhqSelfInfo = { ...selfInfo }
  let checkLoginInterval: NodeJS.Timeout = setInterval(async () => {
    try {
      pmhqSelfInfo = await pmhq.call('getSelfInfo', [])
    } catch (e) {
      ctx.logger.info('获取账号信息状态失败', e)
    }
    if (pmhqSelfInfo.online) {
      clearInterval(checkLoginInterval)
      selfInfo.uin = pmhqSelfInfo.uin
      selfInfo.uid = pmhqSelfInfo.uid
      selfInfo.nick = pmhqSelfInfo.nick
      if (!selfInfo.uin) {
        let uin: string
        // 循环 5次 获取uin
        for (let i = 0; i < 5; i++) {
          try {
            uin = await ctx.ntUserApi.getUinByUid(selfInfo.uid)
            selfInfo.uin = uin
            break
          } catch (e) {
            await sleep(1000)
          }
        }
      }
      selfInfo.online = true
      if (!selfInfo.nick) {
        ctx.ntUserApi.fetchUserDetailInfo(selfInfo.uid).then(res => {
          if (res.result !== 0) {
            throw new Error(res.errMsg)
          }
          selfInfo.nick = res.detail.get(selfInfo.uid)!.simpleInfo.coreInfo.nick
        }).catch(e => {
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
  }, 1000)

  ctx.logger.info(`LLTwoBot ${version}`)
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
