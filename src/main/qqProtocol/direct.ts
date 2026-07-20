import { Context } from 'cordis'
import { selfInfo, authTokenStatus } from '@/common/globalVars'
import type { PBData } from './types'
import {
  DirectProtocolClient,
  fetchQrCode,
  pollQrCode,
  loginWithQrResult,
  registerOnline,
  startHeartbeat,
  getCorrectUin,
  QrCodeState,
  AppInfo,
  saveSession,
  loadSession,
  deleteSession,
  listAvailableSessions,
  persistedToSessionInfo,
  getSpecifiedUin,
  getSessionFilePathForUin,
} from './direct-lib'
import type { QrCodeResult, QrPollResult } from './direct-lib'
import { overwriteMachineGuid, deleteMachineGuid, loadMachineGuidSync } from './direct-lib/machineGuid'
import { updateAuthToken } from './direct-lib/sign'
import { authTokenUtil } from '../config'
import { setLoginState } from '../llbot-ipc'
import { version } from '../../version'
import { startAuthTokenWatcher } from './direct-lib/authTokenWatcher'
import { QQProtocolBase } from './base'

/**
 * Direct 模式实现: 走 native sign + TCP 直连. QQ 未登录 -> WebUI 扫码.
 * 内部持有一个低层 native `DirectProtocolClient` (direct-lib/client.ts, 不要跟本类混淆).
 */
export class DirectQQProtocol extends QQProtocolBase {
  private directClient: DirectProtocolClient | null = null
  private directInitInFlight: boolean = false
  private directPendingToken: string = ''
  // native 二维码凭证 (sig/tgtgtKey/image), poll 与 completeDirectLogin 要用. 与 base.qrResult (展示缓存) 并存.
  private directQrResult: QrCodeResult | null = null
  private directPollResult: QrPollResult | null = null
  private directStopHeartbeat: (() => void) | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private manualLogout = false
  // 每次 fetchQrCode 都 ++, 旧 poll 循环发现 token 变了就自动退出, 避免刷新二维码后累积多条并行 poll 链.
  // 同时也被 doInitDirectClient (换账号/重建 client) bump, 取消旧 poll. base 的展示缓存 TTL 独立于它.
  private qrPollToken: number = 0
  private static readonly QR_TTL_MS = 180_000
  private static readonly RECONNECT_MS = 5_000

  // 运行时指定要恢复的 session uin (WebUI 快速登录设一次, 下一次 initDirectClient 用它 loadSession).
  // 不影响 argv 的 -q, 只是补充: WebUI 需要用户运行时选账号
  private runtimeUinOverride: string | null = null

  constructor(ctx: Context) {
    super(ctx)
  }

  protected async start(): Promise<void> {
    this.ctx.on('nt/kicked-offline', () => {
      if (this.directStopHeartbeat) { this.directStopHeartbeat(); this.directStopHeartbeat = null }
      // 异地登录顶号 = 密码/凭证可能已泄露. 清掉本机 session + 设备指纹, 强制换新设备身份重新扫码,
      // 不用旧凭证快速登录 (旧凭证会跟顶号方互相顶下线). uin 优先取当前登录态.
      const kickedUin = selfInfo.uin || this.runtimeUinOverride || getSpecifiedUin() || ''
      if (kickedUin) deleteSession(kickedUin)
      deleteMachineGuid()
      // 复用的 client 内存里还持有旧 guid (clearSession 不动它), 重新生成一个并同步给 client + native
      // sign, 否则同进程内不重启就换不掉设备指纹. loadMachineGuidSync 见文件已删会重新随机 + 落盘.
      this.directClient?.setGuid(loadMachineGuidSync())
      this.runtimeUinOverride = null
      this.directClient?.clearSession()
      // 主动断开触发 close -> scheduleReconnect: 顶号时服务器未必立刻断 TCP, 不断的话没有任何东西
      // 会重启扫码 loop (在线时 loop 已停). session 已删, 重连会退回扫码拉新码等用户扫.
      this.directClient?.disconnect()
    })
    // 监听 data/auth_token.txt: 启动即读一次 + 文件变化时读取 -> 校验 -> 通过则触发登录.
    // 没有 token 时只提示, 不再直接 init (无效 token 交给 native sign 会 process.exit 崩溃循环).
    startAuthTokenWatcher(this.onAuthTokenValid.bind(this), this.logger)
  }

  public get_is_connected(): boolean {
    return !!this.directClient?.isLoggedIn
  }

  public async sendPB(cmd: string, pb: Buffer | string, timeout = 15000): Promise<PBData> {
    if (!this.directClient?.isLoggedIn) {
      throw new Error('Direct client not logged in')
    }
    const buf = Buffer.isBuffer(pb) ? pb : Buffer.from(pb, 'hex')
    const resp = await this.directClient.sendCommand(cmd, buf, undefined, timeout)
    return { cmd, pb: resp.payload.toString('hex') }
  }

  /**
   * 列出本地可快速登录的账号 (对应 data/qq-session-<uin>.json). 用于 WebUI 快速登录列表.
   * 直连模式无 QQ NT 进程可问, 只能从本地 session 文件推断; 换机场景对应 session 已解不开,
   * 但此处只列明文元数据, 换机时 quickLogin 阶段 registerOnline 会失败并 fallback 扫码.
   */
  public listQuickLoginAccounts(): Array<{ uin: string; uid: string; nick: string; savedAt: number }> {
    return listAvailableSessions()
  }

  /**
   * WebUI 请求以某个已保存 session 快速登录. 设置 runtime override 后重新 initDirectClient,
   * 走 loadSession(uin) 恢复通道 (等价于用户带 -q <uin> 启动).
   * 已在线时 no-op. session 解不开 (换机) 会抛错让 FE 弹提示, 用户可切扫码登录.
   */
  public async quickLogin(uin: string): Promise<void> {
    if (selfInfo.online) return
    if (!/^\d+$/.test(uin)) throw new Error('invalid uin')
    // 提前 loadSession 探一下: 快速登录必须能解密敏感字段. 解不开就报错让 FE 提示换机 / 切扫码,
    // 不能悄悄降级到 QR 让用户面对无提示的扫码页.
    const preload = loadSession(uin)
    if (!preload) {
      throw new Error('session 已失效(可能换了机器或加密 key 变了), 请扫码重新登录')
    }
    this.runtimeUinOverride = uin
    await this.initDirectClient()
    this.ensureQrLoop()
  }

  public async logout(): Promise<void> {
    this.manualLogout = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.directClient?.clearSession()
    this.directClient?.disconnect()
    selfInfo.online = false
    selfInfo.uin = ''
    selfInfo.uid = ''
    selfInfo.nick = ''
    this.onlineEmitted = false
    this.runtimeUinOverride = null
    setLoginState({ state: 'need_qrcode' })
    this.ensureQrLoop()
  }

  /**
   * base 拉码钩子: 向 QQ 服务器拉一张新二维码 (native wtlogin.trans_emp).
   * 存 native 凭证到 directQrResult (poll/登录要用 sig/tgtgtKey), 返回展示信息给 base 缓存.
   * client 未就绪时返回 null, base loop 静默重试.
   */
  protected async fetchFreshQrCode(): Promise<{ qrcodeUrl: string; pngBase64: string; expireTimeSec: number; sig: string } | null> {
    if (!this.directClient) return null
    const qr = await fetchQrCode(this.directClient)
    this.directQrResult = qr
    return {
      qrcodeUrl: qr.url,
      pngBase64: qr.image.length > 0 ? 'data:image/png;base64,' + qr.image.toString('base64') : '',
      expireTimeSec: DirectQQProtocol.QR_TTL_MS / 1000,
      sig: qr.sig.toString('hex'),
    }
  }

  /** base 拉到新码后: 启动 native 扫码 poll (等手机扫码 -> Confirmed -> completeDirectLogin). */
  protected onQrRefreshed(): void {
    this.startDirectQrPolling()
  }
  // ---- 内部: authTokenWatcher 回调 + 登录 loop ----

  /**
   * authTokenWatcher 校验通过 token 后回调本方法. 登录/sign 阶段的错误写回
   * authTokenStatus.loginError 供 WebUI 展示; init 抛错的话交给 watcher 定时重试自愈.
   */
  private async onAuthTokenValid(token: string): Promise<void> {
    if (selfInfo.online) return
    try {
      await this.initDirectClient(token)
      this.ensureQrLoop()
    } catch (e) {
      authTokenStatus.loginError = (e as Error)?.message || String(e)
      this.logger.error('[Sign] auth_token 校验通过但登录初始化失败:', e)
      throw e  // 交给 watcher: init 抛错(通常是 transient connect/网络)才定时重试自愈
    }
  }

  /**
   * 登录中 (isLoggedIn 但 online 未置) 暂停打印新码, 但 base 的 qrLoop 继续 tick --
   * 以防 register 失败清 session 后无码可出. 真在线由 qrLoop 顶部 guard 停.
   */
  protected shouldSkipQrPrint(): boolean {
    return !!this.directClient?.isLoggedIn
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || selfInfo.online) return
    if (!(authTokenUtil.reload() || process.env.AUTH_TOKEN || '').trim()) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (selfInfo.online) return
      try {
        await this.initDirectClient()
        this.ensureQrLoop()
      } catch (e) {
        this.logger.warn('[Direct] 重连失败, 稍后重试', e)
      }
      this.scheduleReconnect()
    }, DirectQQProtocol.RECONNECT_MS)
  }

  // ---- 内部: 底层 client 初始化 + 会话恢复 ----

  /**
   * Initialize direct protocol client and attempt session restore.
   *
   * auth_token 未配置时不再 throw: 直接 return, 让进程/WebUI 正常起来. token 校验通过后
   * 由 authTokenWatcher 调 onAuthTokenValid -> 本方法(带已校验的 token)开始登录.
   * token 有效性校验在 watcher 里 (validateAuthToken), 这里不再做 preflight.
   * 可重入: 二次调用先拆掉上一个 client, 并把最新 token 热切换进 native sign。
   */
  private async initDirectClient(tokenArg?: string): Promise<void> {
    // 优先用调用方 (watcher) 已校验过的 token; 没传才回退读文件. 保证交给 native sign 的
    // 就是 validateAuthToken 校验通过的那一份, 不因期间文件被外部改写而分叉.
    let authToken = (tokenArg || authTokenUtil.reload() || process.env.AUTH_TOKEN || '').trim()
    if (!authToken) {
      const tokenPath = authTokenUtil.getPath()
      this.logger.warn(
        `[Sign] auth_token 未配置 (${tokenPath} 为空 / 不存在). ` +
        `请在 WebUI 中录入, 或到 https://auth.luckylillia.com 获取后填入; 录入验证通过后会自动开始登录.`
      )
      return
    }
    // 重入合并: 已有 init 在跑时不丢弃, 记下最新 token, 当前这次结束后用它再跑一次
    if (this.directInitInFlight) {
      this.directPendingToken = authToken
      return
    }
    this.directInitInFlight = true
    let lastErr: unknown = null
    try {
      do {
        this.directPendingToken = ''
        try {
          lastErr = null
          await this.doInitDirectClient(authToken)
        } catch (e) {
          lastErr = e
        }
        authToken = this.directPendingToken
      } while (authToken)
    } finally {
      this.directInitInFlight = false
      this.directPendingToken = ''
    }
    if (lastErr) throw lastErr
  }

  private async doInitDirectClient(authToken: string): Promise<void> {
    this.manualLogout = false
    // 换账号 / 重试时取消上一轮残留的 QR poll loop (qrPollToken 变 -> 旧 poll 循环下一 tick 自退)
    this.qrPollToken++
    // 换账号/重建 client: 清 base 展示缓存, 否则 TTL 内会复用上一账号的旧码
    this.resetQrState()
    this.directQrResult = null

    // native sign 已 init 时热切换到最新 token; 未 init (首次) 时 no-op, token 由 new client 的 config 带入
    await updateAuthToken(authToken).catch((e) => this.logger.warn('[Sign] updateAuthToken failed:', (e as Error).message))

    // 先 loadSession 拿 (uin, guid). 运行时 override 优先于 argv -q.
    const specifiedUin = this.runtimeUinOverride || getSpecifiedUin()
    if (specifiedUin) {
      this.logger.info('Specified login uin: %s, will try qq-session-%s.json', specifiedUin, specifiedUin)
    } else {
      this.logger.info('No uin specified, will perform fresh QR login (session will be saved as qq-session-<uin>.json)')
    }
    const persisted = loadSession(this.runtimeUinOverride ?? undefined)

    // session.guid 跟 machine_guid.bin 不一致时以 session 为准, 落盘同步
    if (persisted) {
      overwriteMachineGuid(Buffer.from(persisted.guid, 'hex'))
    }

    // native sign 首次 init 需要 uin 才能签握手命令 (服务器 400 'missing uin'). 优先级:
    //   1) 有持久化 session -> session.uin  2) 快速登录/argv -q 指定 -> 用它  3) fresh 扫码 -> undefined
    const uinCandidate = persisted?.uin || specifiedUin || ''
    const uinForInit = uinCandidate ? Number(uinCandidate) : undefined
    const uinArg = Number.isFinite(uinForInit) && (uinForInit as number) > 0 ? (uinForInit as number) : undefined

    // 复用单 client: native sign 是进程单例, relay (SENDER OnceCell) 只在首个 client 首次 connect 时
    // 绑定且无法重绑. 重建 client 会让 relay 悬空 -> token-acquire 的 ESK relay 发到已死的旧 client
    // (session=null) -> sign 缺 uin -> 服务器 400. 所以全程只用一个 client: 首次建立并挂事件, 之后复用,
    // 换 token/账号只热切换配置 (setAuthToken/setUin/setGuid), 绝不重建.
    if (!this.directClient) {
      this.directClient = new DirectProtocolClient({
        authToken,
        botVersion: `LLBot_${version}`,
        uin: uinArg,
      })
      this.bindDirectClientEvents(this.directClient)
    } else {
      this.directClient.setAuthToken(authToken)
      this.directClient.setUin(uinArg)
      this.directClient.clearSession() // 换账号: 丢掉上一账号 session, 下面 restore/fresh 从干净态走
      // 换到不同 guid 的 session (换机导入的账号) 时, 同步 client + native sign 的 device 指纹
      if (persisted) {
        const g = Buffer.from(persisted.guid, 'hex')
        if (!g.equals(this.directClient.getGuid())) this.directClient.setGuid(g)
      }
    }

    if (persisted) {
      // uin 授权/绑定由服务端判 (登录时按配额自动绑, 满了才 403); 本地不预检 allowed_uins.
      this.logger.info('Found saved session for UIN %s (file: %s), attempting restore...', persisted.uin, getSessionFilePathForUin(persisted.uin))
      if (!this.directClient.isConnected) await this.directClient.connect()
      const session = persistedToSessionInfo(persisted)
      this.directClient.setSession(session)

      try {
        await registerOnline(this.directClient)
        this.logger.info('[QQ Server] Online registered!')
        selfInfo.uin = persisted.uin
        selfInfo.uid = persisted.uid
        if (persisted.nick) selfInfo.nick = persisted.nick
        selfInfo.online = true
        // 记住已登录 uin: 断线重连走 initDirectClient() 时用它 loadSession 快速登录, 不退回扫码.
        this.runtimeUinOverride = persisted.uin
        this.directStopHeartbeat = startHeartbeat(this.directClient)
        this.maybeEmitOnline()
        // 直连 session 恢复后 nick 可能为空; 异步补查
        if (!selfInfo.nick) this.scheduleFetchSelfNick()
        return
      } catch (e) {
        // 恢复失败 (session 过期): 清 session, 但保留 TCP 连接复用给扫码 -- 不 disconnect, 否则会触发
        // close 事件且 native sign relay 目标断链, 下面 fresh 分支直接用现连接拉码.
        this.logger.info('Saved session expired, will need QR login: %s', (e as Error).message)
        this.directClient.clearSession()
      }
    }

    // Fresh QR: 复用现有连接, 未连才连
    if (!this.directClient.isConnected) await this.directClient.connect()
  }

  /** 给 client 挂事件 (error/connected/close/push). 只在首次建立 client 时调一次 -- 复用 client 不重挂. */
  private bindDirectClientEvents(client: DirectProtocolClient): void {
    client.on('error', (err: Error) => {
      this.logger.warn('Direct client error:', err.message)
    })
    // native 连接建立 -> 更新 lastConnectedTime, 让 startDisconnectMonitoring 从此刻起监控
    client.on('connected', () => {
      this.lastConnectedTime = Date.now()
    })
    client.on('close', () => {
      const wasOnline = this.onlineEmitted
      selfInfo.online = false
      if (this.directStopHeartbeat) {
        this.directStopHeartbeat()
        this.directStopHeartbeat = null
      }
      this.onlineEmitted = false
      if (wasOnline) {
        this.ctx.parallel('protocol/disconnect')
        // 网络断开: 用保存的 session 快速重连 (runtimeUinOverride 已在登录成功时记下).
        // 顶号(kick): nt/kicked-offline 已删 session + guid 并清 runtimeUinOverride, 故重连会退回
        // 扫码 -- 不会用旧凭证跟顶号方互相顶下线, 安全. 两种都重连, 只有主动 logout 不重连.
        if (!this.manualLogout) this.scheduleReconnect()
      }
    })
    client.on('push', (packet: { cmd: string; payload: Buffer }) => {
      // 收到包 = 连着; 顺带刷新 lastConnectedTime
      this.lastConnectedTime = Date.now()
      this.ctx.parallel('qq/raw', { cmd: packet.cmd, payload: packet.payload })
    })
  }

  // ---- 内部: 扫码轮询 + 登录收尾 ----

  private startDirectQrPolling() {
    if (!this.directClient || !this.directQrResult) return
    const myToken = ++this.qrPollToken

    const poll = async () => {
      if (this.qrPollToken !== myToken) return  // 已被新一轮刷新取消
      if (!this.directClient || !this.directQrResult) return
      if (this.directClient.isLoggedIn) return

      try {
        const result = await pollQrCode(this.directClient, this.directQrResult.sig)
        if (this.qrPollToken !== myToken) return
        this.directPollResult = result

        if (result.state === QrCodeState.Confirmed) {
          await this.completeDirectLogin()
          return
        }

        if (result.state === QrCodeState.WaitingForConfirm) {
          // 已扫码, 等手机确认 (Desktop 显示"请在手机上确认登录")
          setLoginState({ state: 'waiting_confirm' })
        }

        if (result.state === QrCodeState.Expired || result.state === QrCodeState.Cancelled) {
          // 让缓存立即失效, qrLoop 下一 tick 就会通过 refreshQrCodeIfStale 拉新码
          setLoginState({ state: result.state === QrCodeState.Expired ? 'expired' : 'cancelled' })
          this.invalidateQrCache()
          return
        }
      } catch (e) {
        this.logger.warn('QR poll error:', (e as Error).message)
      }

      if (this.qrPollToken !== myToken) return
      setTimeout(poll, 2000)
    }

    setTimeout(poll, 2000)
  }

  private async completeDirectLogin() {
    if (!this.directClient || !this.directPollResult || !this.directQrResult) return
    this.manualLogout = false

    // Get UIN
    const urlParams = new URL(this.directQrResult.url).searchParams
    const qrSig = urlParams.get('k') || ''
    const uin = await getCorrectUin(AppInfo.appId, qrSig)
    this.directPollResult.uin = String(uin)

    // uin 授权/绑定由服务端判 (登录时按配额自动绑, 满了才 403); 本地不预检 allowed_uins.

    // wtlogin.login
    const loginResult = await loginWithQrResult(this.directClient, this.directPollResult)
    if (!loginResult.success) {
      this.logger.error(`Login failed: state=${loginResult.state} ${loginResult.tag} ${loginResult.message}`)
      // 登录失败原因回传 WebUI (如 auth_token 可用 QQ 数量已达上限)
      authTokenStatus.loginError = `登录失败: ${[loginResult.tag, loginResult.message].filter(Boolean).join(' ')}`.trim()
      return
    }

    this.logger.info(`Login successful! UID: ${loginResult.uid}, nick: "${loginResult.nick}"`)

    // Save session
    const session = this.directClient.getSession()!
    saveSession(session, this.directPollResult.tgtgtKey!, this.directClient.getGuid(), loginResult.tempPassword, loginResult.nick)

    // Register online: 失败视为登录未完成, 不标记在线, 报错回 WebUI. 必须清掉半成品 session
    // (loginWithQrResult 已 setSession -> isLoggedIn=true), 否则扫码 loop 认为已登录会停, 不出新码,
    // 变成收不到 MsgPush 的"假在线". 连接保留复用, 下一轮 loop 直接拉新码.
    try {
      await registerOnline(this.directClient)
    } catch (e) {
      const msg = (e as Error).message
      this.logger.error('Register online failed:', msg)
      authTokenStatus.loginError = `上线注册失败: ${msg}`
      this.directClient.clearSession()
      return
    }

    // Start heartbeat
    this.directStopHeartbeat = startHeartbeat(this.directClient)

    // Update global state
    selfInfo.uin = String(uin)
    selfInfo.uid = loginResult.uid
    selfInfo.nick = loginResult.nick
    selfInfo.online = true
    // 记住已登录 uin: 断线重连走 initDirectClient() 时用它 loadSession 快速登录, 不退回扫码.
    this.runtimeUinOverride = String(uin)
    this.maybeEmitOnline()
    if (!selfInfo.nick) this.scheduleFetchSelfNick()
  }
}
