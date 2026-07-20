import { selfInfo, authTokenStatus, TEMP_DIR } from '@/common/globalVars'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'
import { Oidb } from '@/ntqqapi/proto'
import type { PBData } from './types'
import { Context, Service } from 'cordis'
import { setLoginState } from '../llbot-ipc'

type DisconnectCallback = (duration: number) => void

interface DisconnectCallbackInfo {
  timeout: number
  callback: DisconnectCallback
  triggered: boolean
}

declare module 'cordis' {
  interface Events {
    /** QQ 登录成功（uid/uin 都齐了），main.ts 监听该事件加载上层插件 */
    'qq/online': () => void
    /** 协议层断开（WS / TCP 掉了）。上层一般不需要卸插件，等协议层重连后会再次 emit `qq/online` */
    'protocol/disconnect': () => void
    'llbot/self-nick-changed': (info: { nick: string }) => void
  }
}

/**
 * QQProtocolBase: PMHQ / Direct 两模式共享的抽象层.
 * - sendPB/get_is_connected/start/getLoginQrCode 是 abstract, 由子类按各自传输实现.
 * - sendOidb / onDisconnect / maybeEmitOnline / msgPBMap 是通用工具, 在这里定型.
 * - 具体实现: PmhqQQProtocol (WS+HTTP) / DirectQQProtocol (native sign + TCP).
 */
export abstract class QQProtocolBase extends Service {
  static inject = ['config']

  private disconnectCallbacks: Map<string, DisconnectCallbackInfo> = new Map()
  protected lastConnectedTime: number = Date.now()
  private disconnectCheckTimer: NodeJS.Timeout | undefined
  public msgPBMap: Map<string, string> = new Map<string, string>()
  protected logger

  // 子类共享: online 事件只 emit 一次的去重 flag
  protected onlineEmitted: boolean = false

  // ---- 通用 QR 二维码: 缓存 + 终端展示 + tick loop (Direct / PMHQ 共用) ----
  // 展示用缓存 (一张码). Direct 另有 native 凭证 (sig/tgtgtKey) 单独存在子类.
  protected qrResult: { qrcodeUrl: string; pngBase64: string; expireTimeSec: number; sig: string } | null = null
  protected qrFetchedAt: number = 0
  // 已打印到终端的 sig 去重: 换新码才重新打印, 避免每秒 tick 重复 dump 同一张
  protected lastPrintedQrSig: string = ''
  private qrLoopRunning: boolean = false

  constructor(protected ctx: Context) {
    super(ctx, 'qqProtocol')
    this.logger = ctx.logger('qq-protocol')
  }

  // ---- 抽象接口: 两个实现必须提供相同的方法名和 shape ----

  /** 底层发包. mixins 只依赖它, 与传输无关. */
  public abstract sendPB(cmd: string, pb: Buffer | string, timeout?: number): Promise<PBData>

  /** 当前传输是否连通(用于 disconnect 监控). */
  public abstract get_is_connected(): boolean

  /**
   * 拉一张**新**登录二维码 (原子操作, 子类各自实现):
   * - Direct: 包 native fetchQrCode (wtlogin.trans_emp)
   * - PMHQ: 包 /get_login_qrcode 接口
   * expireTimeSec 是这张码的有效秒数 (base 用它做 TTL: 没过期不重拉).
   * sig 用于终端打印去重 (Direct 用 native sig hex, PMHQ 用 qrcodeUrl).
   * 返回 null = 暂不可用 (QQ 未起 / 已登录), loop 静默重试.
   */
  protected abstract fetchFreshQrCode(): Promise<{
    qrcodeUrl: string
    pngBase64: string
    expireTimeSec: number
    sig: string
  } | null>

  /**
   * 列出本地可快速登录的账号. **仅 Direct 模式实现** -- 直连持有 data/qq-session-*.json 是唯一可靠来源.
   * PMHQ 模式下 QQ NT 已登过, WebUI 不复用它的快速登录列表(那是 Desktop 的路径), 走 base 默认返空,
   * FE 拿到空列表会自动切扫码模式. 别在 PMHQ 里补真正的实现.
   */
  public listQuickLoginAccounts(): Array<{ uin: string; uid: string; nick: string; savedAt: number }> {
    return []
  }

  /**
   * 以指定 uin 快速登录. **仅 Direct 模式实现** -- 依赖 qq-session-<uin>.json 的加密凭证.
   * PMHQ 走 base 默认直接抛; 上层路由收到 500 后 FE 会 fallback 到扫码.
   */
  public async quickLogin(_uin: string): Promise<void> {
    throw new Error('quickLogin not supported in this mode')
  }

  /** 退出当前 QQ 登录, 回未登录态. 仅 Direct 模式实现; PMHQ 走 base 默认 no-op. */
  public async logout(): Promise<void> {}

  /**
   * 模式启动入口. cordis Service.init 里 await 一次:
   * - PMHQ: 起 WS 连接 + 登录探测
   * - Direct: 起 authTokenWatcher, 校验通过后拉起扫码 loop
   */
  protected abstract start(): Promise<void>

  async [Service.init]() {
    await this.start()
    this.startDisconnectMonitoring()
  }

  // ---- 通用: OIDB 封装, 只依赖抽象 sendPB ----

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

  // ---- 通用: online 事件去重 emit ----

  protected maybeEmitOnline() {
    if (this.onlineEmitted) return
    if (!selfInfo.online) return
    if (!selfInfo.uid && !selfInfo.uin) return
    this.onlineEmitted = true
    authTokenStatus.loginError = '' // 登录成功, 清掉登录错误
    this.ctx.parallel('qq/online')
  }

  /**
   * emit qq/online 之后 ntUserApi 才会随插件加载. 用 ctx.inject 等它 ready 再拉一次 nick;
   * 拿到就写 selfInfo.nick, 失败就 warn 一下留空。子类在登录成功后调用。
   * guardToken/guardCheck 用于避免拿到 nick 时会话已换代(重复登录/换号)后错误写回。
   */
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

  // ---- 通用 QR: 缓存 pull-through + 终端展示 + tick loop ----

  /**
   * WebUI / 外部拉登录二维码 -- 只返回后端当前缓存的那张 (过期才拉新).
   * 保证终端 QR / WebUI QR / Desktop QR 同源. expireTime 是剩余有效秒数,
   * FE 拿它 setTimeout 到期显示"点击刷新".
   */
  public async getLoginQrCode(): Promise<{ qrcodeUrl: string; pngBase64QrcodeData: string; expireTime: number; pollTimeInterval: number }> {
    await this.refreshQrCodeIfStale()
    const qr = this.qrResult
    if (!qr) throw new Error('QR code unavailable')
    const remainingMs = Math.max(0, qr.expireTimeSec * 1000 - (Date.now() - this.qrFetchedAt))
    return {
      qrcodeUrl: qr.qrcodeUrl,
      pngBase64QrcodeData: qr.pngBase64,
      expireTime: Math.max(1, Math.floor(remainingMs / 1000)),
      pollTimeInterval: 3,
    }
  }

  /** 缓存无 / 到期 (按该码自己的 expireTimeSec) 才拉新码; 否则复用. */
  protected async refreshQrCodeIfStale(): Promise<void> {
    const fresh = this.qrResult && Date.now() - this.qrFetchedAt < this.qrResult.expireTimeSec * 1000
    if (fresh) return
    const qr = await this.fetchFreshQrCode()
    if (!qr) return
    this.qrResult = qr
    this.qrFetchedAt = Date.now()
    this.onQrRefreshed()
  }

  /** 让缓存立即过期, 下次 refreshQrCodeIfStale 就会拉新码. */
  protected invalidateQrCache(): void {
    this.qrResult = null
    this.qrFetchedAt = 0
  }

  /** 完整复位 QR 展示状态 (缓存 + 打印去重 sig). 子类断线/重连/换账号时调, 保证重连后重新拉码打印. */
  protected resetQrState(): void {
    this.qrResult = null
    this.qrFetchedAt = 0
    this.lastPrintedQrSig = ''
  }

  /**
   * 拉码钩子: refreshQrCodeIfStale 拉到新码后调. 默认空.
   * Direct override 里启动 native 扫码 poll; PMHQ 无需 (靠 /health 探测 online).
   */
  protected onQrRefreshed(): void {}

  /**
   * 拉二维码 -> 终端 ASCII 打印 + 落盘 png + 推 Desktop IPC + web url.
   * 按 sig 去重: 同一张码只打印一次, 换新码才再输出.
   */
  protected async printQrToTerminal(): Promise<void> {
    try {
      const data = await this.getLoginQrCode()
      const sig = this.qrResult?.sig || ''
      if (!sig || sig === this.lastPrintedQrSig) return
      this.lastPrintedQrSig = sig

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
        this.logger.info(`二维码文件已保存: ${qrFilePath}`)
      }

      const qrWebUrl = `https://api.2dcode.biz/v1/create-qr-code?data=${encodeURIComponent(data.qrcodeUrl)}`
      this.logger.info(`或浏览器打开二维码网址: ${qrWebUrl}`)
    } catch (e) {
      this.logger.warn('获取登录二维码失败', e)
    }
  }

  /** 幂等启动终端扫码 tick loop: 已在跑则不再起新链. 子类未登录时调. */
  protected ensureQrLoop(): void {
    if (this.qrLoopRunning) return
    this.qrLoop()
  }

  /**
   * loop 是否暂停打印新码 (但不停 loop). 默认 false.
   * Direct override: 登录中 (isLoggedIn 但 online 未置) 返回 true -- 别拉新码, 但保持 loop
   * 以防 register 失败清 session 后无码可出.
   */
  protected shouldSkipQrPrint(): boolean { return false }

  /**
   * 终端扫码 loop: online 则停; 未登录每秒 tick 一次 printQrToTerminal.
   * 真正拉新码的节流由 refreshQrCodeIfStale 的 TTL 说了算, 每秒 tick 只在换码时打印.
   */
  private qrLoop = async (): Promise<void> => {
    if (selfInfo.online) { this.qrLoopRunning = false; return }
    this.qrLoopRunning = true
    if (!this.shouldSkipQrPrint()) await this.printQrToTerminal()
    if (selfInfo.online) { this.qrLoopRunning = false; return }
    setTimeout(this.qrLoop, 1000)
  }


  // ---- 通用: 断线回调注册 + 5s 巡检 ----

  public onDisconnect(timeout: number, callback: DisconnectCallback): string {
    const id = randomUUID()
    this.disconnectCallbacks.set(id, { timeout, callback, triggered: false })
    return id
  }

  public offDisconnect(id: string): void {
    this.disconnectCallbacks.delete(id)
  }

  /** 由子类在 start() 完成后调用 (基类 Service.init 里已代为调用一次). 幂等. */
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
