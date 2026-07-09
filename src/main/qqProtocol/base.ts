import { selfInfo, authTokenStatus } from '@/common/globalVars'
import { randomUUID } from 'node:crypto'
import { Oidb } from '@/ntqqapi/proto'
import type { PBData } from './types'
import { Context, Service } from 'cordis'

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

  constructor(protected ctx: Context) {
    super(ctx, 'qqProtocol')
    this.logger = ctx.logger('qq-protocol')
  }

  // ---- 抽象接口: 两个实现必须提供相同的方法名和 shape ----

  /** 底层发包. mixins 只依赖它, 与传输无关. */
  public abstract sendPB(cmd: string, pb: Buffer | string, timeout?: number): Promise<PBData>

  /** 当前传输是否连通(用于 disconnect 监控). */
  public abstract get_is_connected(): boolean

  /** 拉登录二维码. Direct 真实拉; PMHQ 抛不支持(QQ NT 已登过). */
  public abstract getLoginQrCode(): Promise<{ qrcodeUrl: string; pngBase64QrcodeData: string }>

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
