import path from 'node:path'
import Log from './log'
import Core from '../ntqqapi/core'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import Database from 'minato'
import SQLiteDriver from '@minatojs/driver-sqlite'
import Store from './store'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { Config as LLOBConfig } from '../common/types'
import {
  CHANNEL_CHECK_VERSION,
  CHANNEL_ERROR,
  CHANNEL_GET_CONFIG,
  CHANNEL_LOG,
  CHANNEL_SELECT_FILE,
  CHANNEL_SET_CONFIG,
  CHANNEL_UPDATE,
  CHANNEL_SET_CONFIG_CONFIRMED
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
  NTQQWindowApi
} from '../ntqqapi/api'
import { mkdir } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'

declare module 'cordis' {
  interface Events {
    'llob/config-updated': (input: LLOBConfig) => void
  }
}

let mainWindow: BrowserWindow | null = null

// 加载插件时触发
function onLoad() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR)
  }

  ipcMain.handle(CHANNEL_CHECK_VERSION, async () => {
    return checkNewVersion()
  })

  ipcMain.handle(CHANNEL_UPDATE, async () => {
    return upgradeLLOneBot()
  })

  ipcMain.handle(CHANNEL_SELECT_FILE, async () => {
    const selectPath = new Promise<string>((resolve, reject) => {
      dialog
        .showOpenDialog({
          title: '请选择ffmpeg',
          properties: ['openFile'],
          buttonLabel: '确定',
        })
        .then((result) => {
          log('选择文件', result)
          if (!result.canceled) {
            const _selectPath = path.join(result.filePaths[0])
            resolve(_selectPath)
          } else {
            resolve('')
          }
        })
        .catch((err) => {
          reject(err)
        })
    })
    try {
      return await selectPath
    } catch (e) {
      log('选择文件出错', e)
      return ''
    }
  })

  ipcMain.handle(CHANNEL_ERROR, async () => {
    const ffmpegOk = await checkFfmpeg(getConfigUtil().getConfig().ffmpeg)
    llonebotError.ffmpegError = ffmpegOk ? '' : '没有找到 FFmpeg, 音频只能发送 WAV 和 SILK, 视频尺寸可能异常'
    const { httpServerError, wsServerError, otherError, ffmpegError } = llonebotError
    let error = `${otherError}\n${httpServerError}\n${wsServerError}\n${ffmpegError}`
    error = error.replace('\n\n', '\n')
    error = error.trim()
    log('查询 LLOneBot 错误信息', error)
    return error
  })

  ipcMain.handle(CHANNEL_GET_CONFIG, async () => {
    const config = getConfigUtil().getConfig()
    return config
  })

  ipcMain.handle(CHANNEL_SET_CONFIG, (_event, ask: boolean, config: LLOBConfig) => {
    return new Promise<boolean>(resolve => {
      if (!ask) {
        getConfigUtil().setConfig(config)
        log('配置已更新', config)
        checkFfmpeg(config.ffmpeg).then()
        resolve(true)
        return
      }
      dialog
        .showMessageBox(mainWindow!, {
          type: 'question',
          buttons: ['确认', '取消'],
          defaultId: 0, // 默认选中的按钮，0 代表第一个按钮，即 "确认"
          title: '确认保存',
          message: '是否保存？',
          detail: 'LLOneBot配置已更改，是否保存？',
        })
        .then((result) => {
          if (result.response === 0) {
            getConfigUtil().setConfig(config)
            log('配置已更新', config)
            checkFfmpeg(config.ffmpeg).then()
            resolve(true)
          }
        })
        .catch((err) => {
          log('保存设置询问弹窗错误', err)
          resolve(false)
        })
    })
  })

  ipcMain.on(CHANNEL_LOG, (_event, arg) => {
    log(arg)
  })

  async function start() {
    log('process pid', process.pid)
    const config = getConfigUtil().getConfig()
    if (!existsSync(TEMP_DIR)) {
      await mkdir(TEMP_DIR)
    }
    const dbDir = path.join(DATA_DIR, 'database')
    if (!existsSync(dbDir)) {
      await mkdir(dbDir)
    }
    const ctx = new Context()
    ctx.plugin(Log, {
      enable: config.log!,
      filename: logFileName
    })
    ctx.plugin(NTQQFileApi)
    ctx.plugin(NTQQFileCacheApi)
    ctx.plugin(NTQQFriendApi)
    ctx.plugin(NTQQGroupApi)
    ctx.plugin(NTQQMsgApi)
    ctx.plugin(NTQQUserApi)
    ctx.plugin(NTQQWebApi)
    ctx.plugin(NTQQWindowApi)
    ctx.plugin(Core, config)
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: path.join(dbDir, `${selfInfo.uin}.db`)
    })
    ctx.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire! * 1000
    })
    if (config.ob11.enable) {
      ctx.plugin(OneBot11Adapter, {
        ...config.ob11,
        heartInterval: config.heartInterval,
        token: config.token!,
        debug: config.debug!,
        reportSelfMessage: config.reportSelfMessage!,
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
    llonebotError.otherError = ''
    ipcMain.on(CHANNEL_SET_CONFIG_CONFIRMED, (event, config: LLOBConfig) => {
      ctx.parallel('llob/config-updated', config)
    })
  }

  const intervalId = setInterval(() => {
    const self = Object.assign(selfInfo, {
      uin: globalThis.authData?.uin,
      uid: globalThis.authData?.uid,
      online: true
    })
    if (self.uin) {
      clearInterval(intervalId)
      start()
    }
  }, 600)
}

// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
}

try {
  onLoad()
  startHook()
} catch (e) {
  console.log(e)
}

// 这两个函数都是可选的
export { onBrowserWindowCreated }
