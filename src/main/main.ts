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
import { selfInfo, authTokenStatus, LOG_DIR, TEMP_DIR, dbDir } from '../common/globalVars'
import {
  NTFileApi,
  NTFriendApi,
  NTGroupApi,
  NTLoginApi,
  NTMsgApi,
  NTUserApi,
  NTWebApi,
  NTSystemApi,
} from '../ntqqapi/api'
import { existsSync, mkdirSync } from 'node:fs'
import { version } from '../version'
import { WebuiServer } from '../webui/BE/server'
import { sleep } from '@/common/utils'
import EmailNotificationService from '@/common/emailNotification'
import { EmailConfig } from '@/common/emailConfig'
import { isDockerEnvironment, isPmhqMode } from '@/common/utils/environment'
import { pathToFileURL } from 'node:url'
import { QQProtocolClient } from './qqProtocol'
import { startAuthTokenWatcher } from './qqProtocol/direct/authTokenWatcher'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from './config'
import { startIpcServer, setLoginState, getCurrentLoginState } from './llbot-ipc'

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

  ctx.plugin(Log)
  ctx.plugin(LoggerConsole, {
    levels: {
      default: 2
    }
  })
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(QQProtocolClient)
  ctx.plugin(NTFileApi)
  ctx.plugin(NTFriendApi)
  ctx.plugin(NTGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTMsgApi)
  ctx.plugin(NTUserApi)
  ctx.plugin(NTWebApi)
  ctx.plugin(NTSystemApi)

  let config: LLBotConfig
  // 上层会话插件只加载一次，重连后不重新加载（断线时上层服务希望透明渡过短时断网）
  let sessionLoaded = false

  const loadPluginAfterLogin = () => {
    if (sessionLoaded) return
    sessionLoaded = true
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: pathToFileURL(path.join(dbDir, `${selfInfo.uin}.v3.db`)).href,
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
  let directLoopRunning = false

  const isDocker = isDockerEnvironment()
  const useDirectProtocol = !isPmhqMode()

  const printLoginQrCode = async () => {
    try {
      const data = await ctx.qqProtocol.getDirectLoginQrCode()

      // 推给 Desktop (无头模式扫码登录对话框)
      setLoginState({ state: 'need_qrcode', qrcode_png_base64: data.pngBase64QrcodeData })

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
    if (selfInfo.online) { directLoopRunning = false; return }
    directLoopRunning = true
    const info = ctx.qqProtocol.getDirectSelfInfo()
    if (!info.online) {
      const now = Date.now()
      // 二维码过期 / 被取消时立即重新获取 (Desktop 扫码界面才能及时刷新), 否则按 120s 节流刷新
      const st = getCurrentLoginState().state
      const needRefresh = st === 'expired' || st === 'cancelled'
      if (needRefresh || now - lastQrCodeTime > 120_000) {
        lastQrCodeTime = now
        printLoginQrCode()
      }
      setTimeout(directLoginLoop, 1000)
    } else {
      // isLoggedIn 为真但 selfInfo.online 未置 (登录中 / register 失败清 session 前的中间态):
      // 继续轮询别停, 否则 register 失败 clearSession 后没有新码. 真在线由顶部 guard 停 loop.
      setTimeout(directLoginLoop, 1000)
    }
  }

  // 幂等启动扫码 loop: 已在运行则不再起新链, 避免多条 setTimeout 链并行拉码
  const ensureDirectLoginLoop = () => {
    if (directLoopRunning) return
    directLoginLoop()
  }

  // auth_token 校验通过后 (由 authTokenWatcher 调): 重建直连并拉起扫码 loop;
  // 登录/sign 阶段的错误写回 authTokenStatus.loginError 给 WebUI 展示
  const onAuthTokenValid = async (token: string) => {
    if (selfInfo.online) return
    try {
      await ctx.qqProtocol.initDirectClient(token)
      lastQrCodeTime = 0
      ensureDirectLoginLoop()
    } catch (e) {
      authTokenStatus.loginError = (e as Error)?.message || String(e)
      ctx.logger.error('[Sign] auth_token 校验通过但登录初始化失败:', e)
      throw e  // 交给 authTokenWatcher: init 抛错(通常是 transient connect/网络)才定时重试自愈
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
      setLoginState({ state: 'logged_in', uin: selfInfo.uin, nickname: selfInfo.nick })
      // 直连模式登录后 nick 可能为空 (session 无 nick / TLV 0x11A 缺失), 异步补查后更新给 Desktop
      if (useDirectProtocol && !selfInfo.nick) {
        ctx.inject(['ntUserApi'], async (userCtx) => {
          try {
            const nick = await userCtx.ntUserApi.getSelfNick(true)
            if (nick) {
              selfInfo.nick = nick
              setLoginState({ nickname: nick })
            }
          } catch (e) {
            ctx.logger.warn('补查登录号昵称失败', e)
          }
        })
      }
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
    if (selfInfo.online && selfInfo.uid) {
      handleOnline()
    }

    ctx.on('llbot/self-nick-changed', (info) => {
      setLoginState({ nickname: info.nick })
    })

    ctx.on('protocol/disconnect', () => {
      ctx.logger.info('协议层断开，等待重连…')
    })

    // 两种模式都启动 IPC server: Desktop 统一通过 IPC 拿 uin/昵称 (有头 PMHQ 模式也需要)
    startIpcServer()
    setLoginState({ state: 'initializing' })
    if (useDirectProtocol) {
      // 监听 data/auth_token.txt: 启动即读一次 + 文件变化时读取 -> 校验 -> 通过则 onAuthTokenValid 登录.
      // 没有 token 时只提示, 不再直接 init (无效 token 交给 native sign 会 process.exit 崩溃循环).
      startAuthTokenWatcher(onAuthTokenValid, ctx.logger)
    } else {
      ctx.qqProtocol.startHook()
    }
  })

  // 全局兜底：单个 orphaned rejection / 未捕获异常不该拖垮整个 bot 进程。
  // 典型来源见 ntMsgApi.sendMsg：群发失败提前 throw 后，echoP 的 7s timer 仍会 reject。
  // 这里只 log 不退出（保 bot 存活）；若想让 docker 拉起干净进程可改成 process.exit(1)。
  process.on('unhandledRejection', (reason) => {
    ctx.logger.error('[unhandledRejection]', reason)
  })
  process.on('uncaughtException', (err) => {
    ctx.logger.error('[uncaughtException]', err)
  })
}

onLoad().catch(e => console.error(e))
