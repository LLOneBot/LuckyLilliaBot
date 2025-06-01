import path from 'node:path'
import Log from './log'
import Core from '../ntqqapi/core'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import Database from 'minato'
import SQLiteDriver from '@minatojs/driver-sqlite'
import Store from './store'
import { Config as LLOBConfig } from '../common/types'
import {
  CHANNEL_CHECK_VERSION,
  CHANNEL_ERROR,
  CHANNEL_GET_CONFIG,
  CHANNEL_LOG,
  CHANNEL_SELECT_FILE,
  CHANNEL_SET_CONFIG,
  CHANNEL_UPDATE
} from '../common/channels'
import { startHook } from '../ntqqapi/hook'
import { checkNewVersion, upgradeLLOneBot } from '../common/utils/upgrade'
import { getConfigUtil } from '../common/config'
import { checkFfmpeg } from '../common/utils/video'
import { Context } from 'cordis'
import { llonebotError, selfInfo, LOG_DIR, DATA_DIR, TEMP_DIR } from '../common/globalVars'
import { log, logFileName } from '../common/utils/legacyLog'
import {
  NTQQFileApi,
  NTQQFileCacheApi,
  NTQQFriendApi,
  NTQQGroupApi,
  NTQQMsgApi,
  NTQQUserApi,
  NTQQWebApi,
  NTQQSystemApi
} from '../ntqqapi/api'
import { existsSync, mkdirSync } from 'node:fs'
import { pmhq } from '@/ntqqapi/native/pmhq'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLOBConfig) => void
  }
}


function onLoad() {
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

  // ipcMain.handle(CHANNEL_CHECK_VERSION, async () => {
  //   return checkNewVersion()
  // })
  //
  // ipcMain.handle(CHANNEL_UPDATE, async () => {
  //   return upgradeLLOneBot()
  // })
  //
  // ipcMain.handle(CHANNEL_ERROR, async () => {
  //   const ffmpegOk = await checkFfmpeg(getConfigUtil().getConfig().ffmpeg)
  //   llonebotError.ffmpegError = ffmpegOk ? '' : '没有找到 FFmpeg, 音频只能发送 WAV 和 SILK, 视频尺寸可能异常'
  //   const { httpServerError, wsServerError, otherError, ffmpegError } = llonebotError
  //   let error = `${otherError}\n${httpServerError}\n${wsServerError}\n${ffmpegError}`
  //   error = error.replace('\n\n', '\n')
  //   error = error.trim()
  //   log('查询 LLOneBot 错误信息', error)
  //   return error
  // })
  //
  // ipcMain.handle(CHANNEL_GET_CONFIG, async () => {
  //   const config = getConfigUtil().getConfig()
  //   return config
  // })
  //
  // ipcMain.handle(CHANNEL_SET_CONFIG, (_event, ask: boolean, config: LLOBConfig) => {
  //   return new Promise<boolean>(resolve => {
  //     if (!ask) {
  //       getConfigUtil().setConfig(config)
  //       log('配置已更新', config)
  //       if (started) {
  //         ctx.parallel('llob/config-updated', config)
  //       }
  //       resolve(true)
  //       return
  //     }
  //     dialog
  //       .showMessageBox(mainWindow!, {
  //         type: 'question',
  //         buttons: ['确认', '取消'],
  //         defaultId: 0, // 默认选中的按钮，0 代表第一个按钮，即 "确认"
  //         title: '确认保存',
  //         message: '是否保存？',
  //         detail: 'LLOneBot配置已更改，是否保存？',
  //       })
  //       .then((result) => {
  //         if (result.response === 0) {
  //           getConfigUtil().setConfig(config)
  //           log('配置已更新', config)
  //           if (started) {
  //             ctx.parallel('llob/config-updated', config)
  //           }
  //           resolve(true)
  //         }
  //       })
  //       .catch((err) => {
  //         log('保存设置询问弹窗错误', err)
  //         resolve(false)
  //       })
  //   })
  // })
  //
  // ipcMain.on(CHANNEL_LOG, (_event, arg) => {
  //   log(arg)
  // })

  const intervalId = setInterval(async () => {
    const pmhqSelfInfo = await pmhq.call('getSelfInfo', [])
    ctx.logger.info('self info', pmhqSelfInfo)
    const self = Object.assign(selfInfo, {
      uin: pmhqSelfInfo.uin,
      uid: pmhqSelfInfo.uid,
      online: true
    })
    if (self.uin) {
      clearInterval(intervalId)
      log('process pid', process.pid)
      const configUtil = getConfigUtil()
      const config = configUtil.getConfig()
      configUtil.listenChange(c=>{
        ctx.parallel('llob/config-updated', c)
      })

      if (config.enableLLOB && (config.satori.enable || config.ob11.enable)) {
        startHook()
        await ctx.sleep(800)
      } else {
        llonebotError.otherError = 'LLOneBot 未启动'
        log('LLOneBot 开关设置为关闭，不启动 LLOneBot')
        return
      }
      ctx.plugin(Log, {
        enable: config.log!,
        filename: logFileName
      })
      ctx.plugin(SQLiteDriver, {
        path: path.join(dbDir, `${selfInfo.uin}.db`)
      })
      ctx.plugin(Store, {
        msgCacheExpire: config.msgCacheExpire! * 1000
      })
      ctx.plugin(Core, config)
      if (config.ob11.enable) {
        ctx.plugin(OneBot11Adapter, {
          ...config.ob11,
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
        })
      }

      ctx.start()
      started = true
      llonebotError.otherError = ''
    }
  }, 500)
}



try {
  onLoad()
} catch (e) {
  console.log(e)
}
