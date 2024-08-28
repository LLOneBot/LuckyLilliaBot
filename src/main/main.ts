import path from 'node:path'
import fs from 'node:fs'
import Log from './log'
import Core from '../ntqqapi/core'
import OneBot11Adapter from '../onebot11/adapter'
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
import { getBuildVersion } from '../common/utils'
import { hookNTQQApiCall, hookNTQQApiReceive } from '../ntqqapi/hook'
import { checkNewVersion, upgradeLLOneBot } from '../common/utils/upgrade'
import { getConfigUtil } from '../common/config'
import { checkFfmpeg } from '../common/utils/video'
import { getSession } from '../ntqqapi/wrapper'
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

declare module 'cordis' {
  interface Events {
    'llonebot/config-updated': (input: LLOBConfig) => void
  }
}

let mainWindow: BrowserWindow | null = null

// 加载插件时触发
function onLoad() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR)
  }

  ipcMain.handle(CHANNEL_CHECK_VERSION, async (event, arg) => {
    return checkNewVersion()
  })

  ipcMain.handle(CHANNEL_UPDATE, async (event, arg) => {
    return upgradeLLOneBot()
  })

  ipcMain.handle(CHANNEL_SELECT_FILE, async (event, arg) => {
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

  ipcMain.handle(CHANNEL_ERROR, async (event, arg) => {
    const ffmpegOk = await checkFfmpeg(getConfigUtil().getConfig().ffmpeg)
    llonebotError.ffmpegError = ffmpegOk ? '' : '没有找到 FFmpeg, 音频只能发送 WAV 和 SILK, 视频尺寸可能异常'
    let { httpServerError, wsServerError, otherError, ffmpegError } = llonebotError
    let error = `${otherError}\n${httpServerError}\n${wsServerError}\n${ffmpegError}`
    error = error.replace('\n\n', '\n')
    error = error.trim()
    log('查询 LLOneBot 错误信息', error)
    return error
  })

  ipcMain.handle(CHANNEL_GET_CONFIG, async (event, arg) => {
    const config = getConfigUtil().getConfig()
    return config
  })

  ipcMain.handle(CHANNEL_SET_CONFIG, (event, ask: boolean, config: LLOBConfig) => {
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

  ipcMain.on(CHANNEL_LOG, (event, arg) => {
    log(arg)
  })

  async function start() {
    log('process pid', process.pid)
    const config = getConfigUtil().getConfig()
    if (!config.enableLLOB) {
      llonebotError.otherError = 'LLOneBot 未启动'
      log('LLOneBot 开关设置为关闭，不启动LLOneBot')
      return
    }
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR)
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
    ctx.plugin(OneBot11Adapter, {
      ...config.ob11,
      heartInterval: config.heartInterval,
      token: config.token!,
      debug: config.debug!,
      reportSelfMessage: config.reportSelfMessage!,
      msgCacheExpire: config.msgCacheExpire!,
    })
    ctx.start()
    ipcMain.on(CHANNEL_SET_CONFIG_CONFIRMED, (event, config: LLOBConfig) => {
      ctx.parallel('llonebot/config-updated', config)
    })
  }

  const buildVersion = getBuildVersion()

  const intervalId = setInterval(() => {
    const self = Object.assign(selfInfo, {
      uin: globalThis.authData?.uin,
      uid: globalThis.authData?.uid,
      online: true
    })
    if (self.uin && (buildVersion >= 27187 || getSession())) {
      clearInterval(intervalId)
      start()
    }
  }, 600)
}

// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
  if (window.id !== 2) {
    return
  }
  mainWindow = window
  log('window create', window.webContents.getURL().toString())
  try {
    hookNTQQApiCall(window)
    hookNTQQApiReceive(window)
  } catch (e: any) {
    log('LLOneBot hook error: ', e.toString())
  }
}

try {
  onLoad()
} catch (e: any) {
  console.log(e.toString())
}

// 这两个函数都是可选的
export { onBrowserWindowCreated }
