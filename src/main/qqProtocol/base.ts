import { selfInfo, authTokenStatus, TEMP_DIR } from '@/common/globalVars'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'
import { Oidb } from '@/ntqqapi/proto'
import type { PBData, QQResourceUsage } from './types'
import { Context, Service } from 'cordis'
import { setLoginState } from '../llbot-ipc'

type DisconnectCallback = (duration: number) => void

interface DisconnectCallbackInfo {
  timeout: number
  callback: DisconnectCallback
  triggered: boolean
}

type LoginQrCode = { qrcodeUrl: string; pngBase64QrcodeData: string; expireTime: number; pollTimeInterval: number }

declare module 'cordis' {
  interface Events {
    /** uid / uin 都已就绪 */
    'qq/online': () => void
    /** 重连后会再次 emit `qq/online` */
    'protocol/disconnect': () => void
    /** An online QQ session was rejected; notify consumers without applying KickNT recovery. */
    'qq/session-expired': (reason: string) => void
    'llbot/self-nick-changed': (info: { nick: string }) => void
  }
}

/** PMHQ (WS + HTTP) 与 Direct (native sign + TCP) 共用的基类 */
export abstract class QQProtocolBase extends Service {
  static inject = ['config']

  private disconnectCallbacks: Map<string, DisconnectCallbackInfo> = new Map()
  protected lastConnectedTime: number = Date.now()
  private disconnectCheckTimer: NodeJS.Timeout | undefined
  protected logger

  protected onlineEmitted: boolean = false
  // Set when the protocol plugin is switched off: every loop and timer checks it before going on
  protected disposed: boolean = false

  protected qrResult: { qrcodeUrl: string; pngBase64: string; expireTimeSec: number; sig: string } | null = null
  protected qrFetchedAt: number = 0
  protected lastPrintedQrSig: string = ''
  private qrLoopRunning: boolean = false
  // Loop-driven QR fetches since the last login or manual refresh, capped by qrAutoRefreshLimit().
  private qrAutoRefreshCount = 0
  private qrAutoRefreshStopLogged = false
  // One fetch at a time: concurrent refreshes (qrLoop tick + WebUI request) share it.
  private qrRefreshInflight: Promise<void> | null = null
  // Consecutive failed fetches; loop-driven fetches wait until qrFetchRetryAt instead of every tick.
  private qrFetchFailures = 0
  private qrFetchRetryAt = 0
  private static readonly QR_FETCH_RETRY_MS = 2_000
  private static readonly QR_FETCH_RETRY_MAX_MS = 30_000

  constructor(protected ctx: Context) {
    super(ctx, 'qqProtocol')
    this.logger = ctx.logger('qq-protocol')
  }

  public abstract sendPB(cmd: string, pb: Buffer | string, timeout?: number): Promise<PBData>

  public abstract get_is_connected(): boolean

  /** expireTimeSec 当 TTL 用, sig 用于终端打印去重。null = 暂不可用 (QQ 未起 / 已登录), loop 静默重试 */
  protected abstract fetchFreshQrCode(): Promise<{
    qrcodeUrl: string
    pngBase64: string
    expireTimeSec: number
    sig: string
  } | null>

  /** 仅 Direct 实现。PMHQ 返空, FE 就切到扫码: PMHQ 的快速登录归 Desktop 管, 别在这里补 */
  public listQuickLoginAccounts(): Array<{ uin: string; uid: string; nick: string; savedAt: number }> {
    return []
  }

  /** 仅 Direct 实现; 抛错时 FE 退回扫码 */
  public async quickLogin(_uin: string): Promise<void> {
    throw new Error('quickLogin not supported in this mode')
  }

  /** 仅 Direct 实现 */
  public async logout(): Promise<void> {}

  /** 只有 PMHQ 有 QQ 进程可量; null 时 WebUI 不显示 QQ 资源卡 */
  public async getQQResourceUsage(): Promise<QQResourceUsage | null> {
    return null
  }

  protected abstract start(): Promise<void>

  async [Service.init]() {
    await this.start()
    this.startDisconnectMonitoring()
    return () => this.stop()
  }

  /**
   * Switching the protocol plugin off. Unlike a disconnect it emits nothing: consumers are going away with it,
   * and the email notification must not report a loss the user asked for.
   */
  protected async stop(): Promise<void> {
    this.disposed = true
    if (this.disconnectCheckTimer) {
      clearInterval(this.disconnectCheckTimer)
      this.disconnectCheckTimer = undefined
    }
    this.disconnectCallbacks.clear()
    this.onlineEmitted = false
    selfInfo.online = false
    selfInfo.uin = ''
    selfInfo.uid = ''
    selfInfo.nick = ''
    this.resetQrState()
    setLoginState({ state: 'initializing', uin: undefined, nickname: undefined, qrcode_png_base64: undefined })
  }

  public async sendOidb(
    command: number,
    subCommand: number,
    body: Buffer,
    cmdSuffix?: string,
  ): Promise<{ errorCode: number, errorMsg: string }> {
    const reqBytes = Oidb.Base.encode({ command, subCommand, body })
    const cmd = cmdSuffix ?? `OidbSvcTrpcTcp.0x${command.toString(16)}_${subCommand}`
    const resp = await this.sendPB(cmd, reqBytes)
    const decoded = Oidb.Base.decode(Buffer.from(resp.pb, 'hex'))
    return { errorCode: decoded.errorCode, errorMsg: decoded.errorMsg }
  }

  protected maybeEmitOnline() {
    if (this.disposed || this.onlineEmitted) return
    if (!selfInfo.online) return
    if (!selfInfo.uid && !selfInfo.uin) return
    this.onlineEmitted = true
    this.qrAutoRefreshCount = 0
    authTokenStatus.loginError = ''
    this.ctx.parallel('qq/online')
  }

  /** ntUserApi 在 qq/online 之后才加载, 所以等它。guardCheck 防止会话已换代 (重复登录 / 换号) 时写回 */
  protected scheduleFetchSelfNick(guardCheck?: () => boolean): void {
    this.ctx.inject(['ntUserApi'], async (ctx) => {
      if (guardCheck && !guardCheck()) return
      try {
        const nick = await ctx.ntUserApi.getSelfNick(false)
        this.logger.info(`getSelfNick -> ${JSON.stringify(nick)}`)
        if (guardCheck && !guardCheck()) return
        if (nick) {
          selfInfo.nick = nick
          ctx.parallel('llbot/self-nick-changed', { nick })
        }
      } catch (e) {
        this.logger.warn(`getSelfNick threw: ${(e as Error).message}`)
      }
    })
  }

  /**
   * 返回缓存的那张 (过期才拉新), 终端 / WebUI / Desktop 显示的是同一张码。expireTime 是剩余秒数。
   * 调用方是 WebUI 上的用户, 算手动刷新, 不受自动刷新上限限制
   */
  public async getLoginQrCode(): Promise<LoginQrCode> {
    const qr = await this.peekLoginQrCode(true)
    if (!qr) throw new Error('QR code unavailable')
    return qr
  }

  /** null: 拉码被跳过 (退避 / 上限 / 登录收尾) 或 client 未就绪。拉码本身报错才抛 */
  private async peekLoginQrCode(manual: boolean): Promise<LoginQrCode | null> {
    await this.refreshQrCodeIfStale(manual)
    const qr = this.qrResult
    if (!qr) return null
    const remainingMs = Math.max(0, qr.expireTimeSec * 1000 - (Date.now() - this.qrFetchedAt))
    return {
      qrcodeUrl: qr.qrcodeUrl,
      pngBase64QrcodeData: qr.pngBase64,
      expireTime: Math.max(1, Math.floor(remainingMs / 1000)),
      pollTimeInterval: 3,
    }
  }

  /**
   * - Loop-driven fetches stop at qrAutoRefreshLimit() and wait out the failure backoff; a manual refresh
   *   skips both and resets the count.
   * - No fetch while a login is completing (shouldSkipQrPrint): that code would go to waste.
   * - Concurrent callers share one fetch: a second one would cancel the poll of the code the WebUI shows.
   */
  protected refreshQrCodeIfStale(manual = false): Promise<void> {
    if (manual) this.qrAutoRefreshCount = 0
    if (this.isQrFresh() || this.shouldSkipQrPrint()) return Promise.resolve()
    if (!manual && (this.qrAutoRefreshCount >= this.qrAutoRefreshLimit() || Date.now() < this.qrFetchRetryAt)) {
      return Promise.resolve()
    }
    this.qrRefreshInflight ??= this.fetchQrIntoCache(manual).finally(() => {
      this.qrRefreshInflight = null
    })
    return this.qrRefreshInflight
  }

  private async fetchQrIntoCache(manual: boolean): Promise<void> {
    const qr = await this.fetchFreshQrCode().catch((e: unknown) => {
      this.qrFetchFailures++
      const backoff = QQProtocolBase.QR_FETCH_RETRY_MS * 2 ** (this.qrFetchFailures - 1)
      this.qrFetchRetryAt = Date.now() + Math.min(backoff, QQProtocolBase.QR_FETCH_RETRY_MAX_MS)
      throw e
    })
    this.qrFetchFailures = 0
    this.qrFetchRetryAt = 0
    if (!qr) return
    if (!manual) this.qrAutoRefreshCount++
    this.qrResult = qr
    this.qrFetchedAt = Date.now()
    this.onQrRefreshed()
  }

  /** The last fetch failed and nothing fresh is cached: skip ticks until the backoff runs out. */
  private qrFetchBackingOff(): boolean {
    return !this.isQrFresh() && Date.now() < this.qrFetchRetryAt
  }

  private isQrFresh(): boolean {
    return !!this.qrResult && Date.now() - this.qrFetchedAt < this.qrResult.expireTimeSec * 1000
  }

  /**
   * Cap on loop-driven QR fetches (first code included) before the loop stops refreshing and waits
   * for a manual refresh. Unlimited by default: PMHQ only reads the codes QQ itself refreshes.
   */
  protected qrAutoRefreshLimit(): number {
    return Number.POSITIVE_INFINITY
  }

  /** Cap reached and the cached code has lapsed: nothing to show until a manual refresh or a login. */
  private qrAutoRefreshExhausted(): boolean {
    if (this.qrAutoRefreshCount < this.qrAutoRefreshLimit() || this.isQrFresh()) {
      this.qrAutoRefreshStopLogged = false
      return false
    }
    if (!this.qrAutoRefreshStopLogged) {
      this.qrAutoRefreshStopLogged = true
      setLoginState({ state: 'expired' })
      this.logger.warn(
        `已自动刷新 ${this.qrAutoRefreshCount} 张二维码仍未登录, 停止自动刷新; 到 WebUI 登录页点击刷新可继续, 或重启`,
      )
    }
    return true
  }

  protected invalidateQrCache(): void {
    this.qrResult = null
    this.qrFetchedAt = 0
  }

  /** 连打印去重的 sig 一起清, 重连后会重新打印 */
  protected resetQrState(): void {
    this.qrResult = null
    this.qrFetchedAt = 0
    this.lastPrintedQrSig = ''
  }

  /** Direct 在这里启动扫码 poll; PMHQ 靠 /health 探测 online */
  protected onQrRefreshed(): void {}

  /** 同时落盘 png、推给 Desktop。同一张码只打印一次 */
  protected async printQrToTerminal(): Promise<void> {
    try {
      const data = await this.peekLoginQrCode(false)
      // 无码可打不是错误: loop 每秒一 tick, 报出来就是刷屏
      if (!data) return
      const sig = this.qrResult?.sig || ''
      if (!sig || sig === this.lastPrintedQrSig) return
      this.lastPrintedQrSig = sig

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
        this.logger.info(`二维码文件已保存: ${qrFilePath}`)
      }

      const qrWebUrl = `https://api.2dcode.biz/v1/create-qr-code?data=${encodeURIComponent(data.qrcodeUrl)}`
      this.logger.info(`或浏览器打开二维码网址: ${qrWebUrl}`)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      const retryInSec = Math.ceil((this.qrFetchRetryAt - Date.now()) / 1000)
      this.logger.warn(retryInSec > 0 ? `获取登录二维码失败: ${reason}, ${retryInSec}s 后重试` : `获取登录二维码失败: ${reason}`)
    }
  }

  protected ensureQrLoop(): void {
    if (this.qrLoopRunning || this.disposed) return
    this.qrLoop()
  }

  /** 只暂停拉码, 不停 loop: register 失败清掉 session 后还得接着出码 */
  protected shouldSkipQrPrint(): boolean { return false }

  /** 每秒一 tick, 拉码节流靠 refreshQrCodeIfStale 的 TTL */
  private qrLoop = async (): Promise<void> => {
    if (this.disposed || selfInfo.online) { this.qrLoopRunning = false; return }
    this.qrLoopRunning = true
    if (!this.shouldSkipQrPrint() && !this.qrAutoRefreshExhausted() && !this.qrFetchBackingOff()) {
      await this.printQrToTerminal()
    }
    if (this.disposed || selfInfo.online) { this.qrLoopRunning = false; return }
    setTimeout(this.qrLoop, 1000)
  }


  public onDisconnect(timeout: number, callback: DisconnectCallback): string {
    const id = randomUUID()
    this.disconnectCallbacks.set(id, { timeout, callback, triggered: false })
    return id
  }

  public offDisconnect(id: string): void {
    this.disconnectCallbacks.delete(id)
  }

  protected startDisconnectMonitoring() {
    if (this.disconnectCheckTimer) return
    this.disconnectCheckTimer = setInterval(() => {
      const isConnected = this.get_is_connected()
      if (isConnected) {
        this.lastConnectedTime = Date.now()
        for (const info of this.disconnectCallbacks.values()) {
          info.triggered = false
        }
      } else {
        const disconnectedDuration = Date.now() - this.lastConnectedTime
        for (const info of this.disconnectCallbacks.values()) {
          if (!info.triggered && disconnectedDuration >= info.timeout) {
            info.triggered = true
            this.logger.warn(`[Protocol] Triggering disconnect callback, duration: ${disconnectedDuration}ms, timeout: ${info.timeout}ms`)
            try {
              info.callback(disconnectedDuration)
            } catch (e) {
              this.logger.error('disconnect callback error', e)
            }
          }
        }
      }
    }, 5000)
  }
}
