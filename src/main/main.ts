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
import { defaultConfig, getConfigUtil } from '../common/config'
import { Context } from 'cordis'
import { llonebotError, selfInfo, LOG_DIR, DATA_DIR, TEMP_DIR, dbDir } from '../common/globalVars'
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
import { WebUIConfigServer, WebUIEntryServer } from '../webui/BE/server'
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
  const ctx = new Context()

  let config = defaultConfig
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
  ctx.plugin(WebUIEntryServer)

  const loadPluginAfterLogin = () => {
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: path.join(dbDir, `${selfInfo.uin}.db`),
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
    ctx.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire! * 1000,
    })
    ctx.plugin(WebUIConfigServer, { ...config.webui, onlyLocalhost: config.onlyLocalhost })
  }

  let started = false
  const pmhqSelfInfo: { uin: string, uid: string, online: boolean } = await pmhq.call('getSelfInfo', [])
  if (pmhqSelfInfo.online) {
    selfInfo.uin = pmhqSelfInfo.uin
    selfInfo.uid = pmhqSelfInfo.uid
    selfInfo.online = true
    ctx.ntUserApi.fetchUserDetailInfo(selfInfo.uid).then(userInfo => {
      selfInfo.nick = userInfo.simpleInfo.coreInfo.nick
    }).catch(e => {
      ctx.logger.warn('获取登录号昵称失败', e)
    })
    config = getConfigUtil().getConfig()
    getConfigUtil().listenChange(c => {
      ctx.parallel('llob/config-updated', c)
    })
    loadPluginAfterLogin()
  }
  else {
    config = defaultConfig
    config.satori.enable = false
    config.ob11.enable = false
    // 有这个事件表示登录成功了
    registerReceiveHook(ReceiveCmdS.INIT, (data: [code: number, unknown: string, uid: string]) => {
      ctx.logger.info('WrapperSession init complete')
      selfInfo.uid = data[2]
      selfInfo.online = true

      const getSelfInfo = async () => {
        const uin = await ctx.ntUserApi.getUinByUid(data[2])
        selfInfo.uin = uin
        loadPluginAfterLogin()
        // this.ctx.database.config.path = path.join(dbDir, `${uin}.db`)
        ctx.ntUserApi.getSelfNick().then(nick => {
          ctx.logger.info(`获取登录号${uin}昵称成功`, nick)
          const oldConfig = getConfigUtil().getConfig()
          Object.assign(selfInfo, {
            uin,
            nick: nick,
            online: true,
          })
          const configUtil = getConfigUtil(true)
          const config = configUtil.getConfig()
          config.webui.token = oldConfig.webui.token
          configUtil.setConfig(config)
          ctx.parallel('llob/config-updated', config)
          configUtil.listenChange(c => {
            ctx.parallel('llob/config-updated', c)
          })
        }).catch(e => {
          ctx.logger.warn('获取登录号昵称失败', e)
        })
      }
      getSelfInfo().catch(e => {
        ctx.logger.error(e)
      })
    })
  }

  ctx.logger.info(`LLOneBot ${version}`)
  // setFFMpegPath(config.ffmpeg || '')
  startHook()
  ctx.start()
  started = true
  llonebotError.otherError = ''
}


try {
  onLoad().then().catch(e => console.log(e))
} catch (e) {
  console.error(e)
}
