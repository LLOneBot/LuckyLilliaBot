import { Context } from 'cordis'
import { authTokenStatus } from './direct-lib/authTokenStatus'
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
import { getCdn, getAuthTokenPageUrl, lockProtocol } from '@/common/utils/environment'
import { overwriteMachineGuid } from './direct-lib/machineGuid'
import { getActiveProfile } from './direct-lib/profiles'
import { updateAuthToken } from './direct-lib/sign'
import { authTokenUtil } from '../../../../../main/config'
import { setLoginState } from '../llbot-ipc'
import { version } from '../../../../../version'
import { startAuthTokenWatcher, stopAuthTokenWatcher } from './direct-lib/authTokenWatcher'
import { QQProtocolBase } from './base'

// Outlives the protocol plugin: native sign binds its relay to the first client and cannot rebind, so switching
// the plugin off only disconnects it and switching it back on picks the same one up
let sharedClient: DirectProtocolClient | null = null

/** 持有的 DirectProtocolClient (direct-lib/client.ts) 是底层连接, 别跟本类混淆 */
export class DirectQQProtocol extends QQProtocolBase {
  private directClient: DirectProtocolClient | null = null
  private directInitInFlight: boolean = false
  private directPendingToken: string = ''
  // poll 和登录要用的凭证 (sig / tgtgtKey); base.qrResult 只是展示缓存
  private directQrResult: QrCodeResult | null = null
  private directPollResult: QrPollResult | null = null
  private directStopHeartbeat: (() => void) | null = null
  // What bindDirectClientEvents attached, so stop() can take this instance off the shared client
  private clientListeners: [string, (...args: any[]) => void][] = []
  private reconnectTimer: NodeJS.Timeout | null = null
  private manualLogout = false
  // 拉新码或重建 client 时 ++, 旧的 poll 循环见它变了就退出
  private qrPollToken: number = 0
  // Cancels an in-flight doInitDirectClient (logout / session-expired / the next init). Kept apart
  // from qrPollToken: a QR fetched while a session restore runs must not abort that restore.
  private initToken: number = 0
  private static readonly QR_TTL_MS = 180_000
  // Auto-fetched QR codes (first one included) before the loop waits for a manual refresh.
  private static readonly QR_AUTO_REFRESH_LIMIT = 10
  private static readonly RECONNECT_MS = 5_000
  private static readonly RECONNECT_MAX_MS = 60_000
  // A quick login that started while another init ran waits this long for that one
  private static readonly QUICK_LOGIN_WAIT_MS = 60_000

  // WebUI 快速登录或登录成功时设置, 下次 initDirectClient 用它 loadSession; 优先于 -q
  private runtimeUinOverride: string | null = null
  // Why the last session restore did not get online: init falls back to QR silently, quick login reports it
  private restoreError: string | null = null

  constructor(ctx: Context) {
    super(ctx)
  }

  protected async start(): Promise<void> {
    this.ctx.on('nt/kicked-offline', (data) => {
      if (this.directStopHeartbeat) { this.directStopHeartbeat(); this.directStopHeartbeat = null }
      // 异地顶号 (1001): 删 session 退回扫码, 不拿旧凭证跟对方互顶。machine_guid 不动: 换 guid 会在服务端多出一台
      // 新设备, 还会让同目录其他账号的 session 失配。其他掉线保留 session, 重连时直接恢复
      if (data.kickedType === 1001) {
        const kickedUin = this.selfInfo.uin || this.runtimeUinOverride || getSpecifiedUin() || ''
        if (kickedUin) deleteSession(kickedUin)
        this.runtimeUinOverride = null
        this.directClient?.clearSession()
      }
      this.directClient?.disconnect()
    })
    startAuthTokenWatcher(this.onAuthTokenValid.bind(this), this.logger, () => this.selfInfo.online)
  }

  /** Disconnects but keeps the saved session, so switching the plugin back on logs in without a QR code. */
  protected async stop(): Promise<void> {
    stopAuthTokenWatcher()
    // Cancels a QR poll or an init still running
    this.qrPollToken++
    this.initToken++
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.directStopHeartbeat) { this.directStopHeartbeat(); this.directStopHeartbeat = null }
    const client = this.directClient
    this.directClient = null
    this.directQrResult = null
    this.directPollResult = null
    if (client) {
      // Before disconnecting: the close handler would schedule a reconnect
      for (const [event, listener] of this.clientListeners) client.off(event, listener)
      this.clientListeners = []
      client.clearSession()
      client.disconnect()
    }
    await super.stop()
  }

  /** session-expired 会 clearSession, 所以 isLoggedIn 能反映凭据作废; 再加上 TCP 状态 */
  public get_is_connected(): boolean {
    return !!this.directClient?.isConnected && !!this.directClient?.isLoggedIn
  }

  public async sendPB(cmd: string, pb: Buffer | string, timeout = 15000): Promise<PBData> {
    if (!this.directClient?.isLoggedIn) {
      throw new Error('Direct client not logged in')
    }
    const buf = Buffer.isBuffer(pb) ? pb : Buffer.from(pb, 'hex')
    const resp = await this.directClient.sendCommand(cmd, buf, undefined, timeout)
    return { cmd, pb: resp.payload.toString('hex') }
  }

  public listQuickLoginAccounts(): Array<{ uin: string; uid: string; nick: string; savedAt: number }> {
    return listAvailableSessions()
  }

  /**
   * 相当于带 -q <uin> 启动, 等到有结果才返回: 上线了就成功, 没上线就抛出原因, FE 显示后退回扫码。
   * init 自己失败时只会悄悄退回扫码, 不等结果的话 WebUI 只能干等
   */
  public async quickLogin(uin: string): Promise<void> {
    if (this.selfInfo.online) return
    if (!/^\d+$/.test(uin)) throw new Error('invalid uin')
    // 先探一下: 解不开要报错, 不能悄悄退回扫码, 让用户对着一张没有提示的码
    const preload = loadSession(uin)
    if (!preload) {
      throw new Error('session 已失效(可能换了机器或加密 key 变了), 请扫码重新登录')
    }
    this.runtimeUinOverride = uin
    this.restoreError = null
    try {
      await this.initDirectClient()
      // Another init was running: it picks this uin up when it goes round again
      const deadline = Date.now() + DirectQQProtocol.QUICK_LOGIN_WAIT_MS
      while (this.directInitInFlight && !this.selfInfo.online && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } finally {
      this.ensureQrLoop()
    }
    if (this.selfInfo.online) return
    throw new Error(this.restoreError ? `快速登录失败: ${this.restoreError}, 请扫码登录` : '快速登录没有成功, 请扫码登录')
  }

  public async logout(): Promise<void> {
    this.manualLogout = true
    this.qrPollToken++
    this.initToken++
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.directClient?.clearSession()
    this.directClient?.disconnect()
    this.selfInfo.online = false
    this.selfInfo.uin = ''
    this.selfInfo.uid = ''
    this.selfInfo.nick = ''
    this.onlineEmitted = false
    this.runtimeUinOverride = null
    // 不然 180s 内登出会复用上一次的旧码
    this.resetQrState()
    setLoginState({ state: 'need_qrcode' })
    this.ensureQrLoop()
  }

  protected async fetchFreshQrCode(): Promise<{ qrcodeUrl: string; pngBase64: string; expireTimeSec: number; sig: string } | null> {
    if (!this.directClient) return null
    // 主动 logout 后不会自动重连, 这里只重建 TCP 拉码, 不恢复 session
    if (!this.directClient.isConnected) await this.directClient.connect()
    // macOS: ESK precedes trans_emp on every connection; no-op while the current one is live.
    await this.directClient.acquirePreLoginToken()
    const qr = await fetchQrCode(this.directClient)
    this.directQrResult = qr
    return {
      qrcodeUrl: qr.url,
      pngBase64: qr.image.length > 0 ? 'data:image/png;base64,' + qr.image.toString('base64') : '',
      expireTimeSec: DirectQQProtocol.QR_TTL_MS / 1000,
      sig: qr.sig.toString('hex'),
    }
  }

  protected onQrRefreshed(): void {
    this.startDirectQrPolling()
  }

  /** 登录错误写进 authTokenStatus.loginError 给 WebUI; init 抛错交给 watcher 定时重试 */
  private async onAuthTokenValid(token: string): Promise<void> {
    if (this.selfInfo.online) return
    try {
      await this.initDirectClient(token)
      this.ensureQrLoop()
    } catch (e) {
      authTokenStatus.loginError = (e as Error)?.message || String(e)
      this.logger.error('[Sign] auth_token 校验通过但登录初始化失败:', e)
      throw e
    }
  }

  protected shouldSkipQrPrint(): boolean {
    return !!this.directClient?.isLoggedIn
  }

  protected qrAutoRefreshLimit(): number {
    return DirectQQProtocol.QR_AUTO_REFRESH_LIMIT
  }

  /**
   * Only a failed init is retried, with backoff. Once init returns the QR loop takes over: rescheduling after a
   * QR fallback would replace the code every 5s.
   */
  private scheduleReconnect(attempt = 0) {
    if (this.reconnectTimer || this.selfInfo.online) return
    if (!(authTokenUtil.reload() || process.env.AUTH_TOKEN || '').trim()) return
    const delay = Math.min(DirectQQProtocol.RECONNECT_MS * 2 ** attempt, DirectQQProtocol.RECONNECT_MAX_MS)
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.selfInfo.online) return
      try {
        await this.initDirectClient()
      } catch (e) {
        this.logger.warn('[Direct] 重连失败, 稍后重试', e)
        this.scheduleReconnect(attempt + 1)
        return
      }
      this.ensureQrLoop()
    }, delay)
  }

  /** 没有 auth_token 时直接返回而不是 throw, 进程和 WebUI 照常起来 */
  private async initDirectClient(tokenArg?: string): Promise<void> {
    // 优先用 watcher 校验过的那份: 文件期间可能又被改了
    let authToken = (tokenArg || authTokenUtil.reload() || process.env.AUTH_TOKEN || '').trim()
    if (!authToken) {
      const tokenPath = authTokenUtil.getPath()
      this.logger.warn(
        `[Sign] auth_token 未配置 (${tokenPath} 为空 / 不存在). ` +
        `请在 WebUI 中录入, 或到 ${getAuthTokenPageUrl()} 获取后填入; 录入验证通过后会自动开始登录.`
      )
      return
    }
    // 已有 init 在跑就记下最新 token, 跑完再来一次
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
    this.restoreError = null
    const myToken = ++this.initToken
    this.qrPollToken++
    // 不然会复用上一个账号的码
    this.resetQrState()
    this.directQrResult = null

    // 首次 init 之前是 no-op, token 由 client 的 config 带入
    await updateAuthToken(authToken).catch((e) => this.logger.warn('[Sign] updateAuthToken failed:', (e as Error).message))
    if (this.initToken !== myToken) return

    const specifiedUin = this.runtimeUinOverride || getSpecifiedUin()
    if (specifiedUin) {
      this.logger.info('Specified login uin: %s, will try %s', specifiedUin, getSessionFilePathForUin(specifiedUin))
    } else {
      this.logger.info('No uin specified, will perform fresh QR login (session will be saved as %s)', getSessionFilePathForUin('<uin>'))
    }
    const persisted = loadSession(this.runtimeUinOverride ?? undefined)

    // guid 以 session 为准
    if (persisted) {
      overwriteMachineGuid(Buffer.from(persisted.guid, 'hex'))
    }

    // 签握手命令要 uin, 但只在有 session 时预先给, 扫码全程不需要。指定了 uin 却没有可用 session 时把它交给 init,
    // SDK 会立刻用这个还没登记的 uin 打 /api/sign/e -> 403 -> exit(1), 所以丢掉它走扫码
    if (specifiedUin && !persisted) {
      this.logger.info(
        'Specified uin %s has no usable session; dropping it and doing a fresh QR login (it will enroll via wtlogin.login)',
        specifiedUin,
      )
    }
    const uinCandidate = persisted?.uin || ''
    const uinForInit = uinCandidate ? Number(uinCandidate) : undefined
    const uinArg = Number.isFinite(uinForInit) && (uinForInit as number) > 0 ? (uinForInit as number) : undefined

    // 只建一个 client: native sign 的 relay 只绑第一个 client 且无法重绑, 重建会让 relay 发到死掉的旧 client。
    // 换 token / 账号只热切换配置
    if (!this.directClient && sharedClient) {
      this.directClient = sharedClient
      this.bindDirectClientEvents(sharedClient)
    }
    if (!this.directClient) {
      // Shared for the life of the process, so a protocol chosen after this waits for a restart
      lockProtocol()
      this.directClient = sharedClient = new DirectProtocolClient({
        authToken,
        botVersion: `LLBot_${version}`,
        uin: uinArg,
        cdn: getCdn(),
      })
      this.bindDirectClientEvents(this.directClient)
    } else {
      this.directClient.setAuthToken(authToken)
      this.directClient.setUin(uinArg)
      this.directClient.clearSession()
      // 从别的机器导入的账号 guid 不同, 同步 client 和 native sign 的设备指纹
      if (persisted) {
        const g = Buffer.from(persisted.guid, 'hex')
        if (!g.equals(this.directClient.getGuid())) this.directClient.setGuid(g)
      }
    }

    if (persisted) {
      // uin 授权由服务端按配额判, 本地不预检
      this.logger.info('Found saved session for UIN %s (file: %s), attempting restore...', persisted.uin, getSessionFilePathForUin(persisted.uin))
      if (!this.directClient.isConnected) await this.directClient.connect()
      if (this.initToken !== myToken) return
      await this.directClient.acquirePreLoginToken()
      if (this.initToken !== myToken) return
      // macOS 用存档凭证刷新票据, d2 过期也能续; 不行就直接恢复
      let session = persistedToSessionInfo(persisted)
      const refreshed = await this.directClient.macosEasyLogin(persisted).catch(() => null)
      if (this.initToken !== myToken) return
      if (refreshed) {
        session = refreshed.session
        this.logger.info('[EasyLogin] macOS 免扫码续期成功')
        saveSession(session, Buffer.from(persisted.tgtgtKey ?? '', 'hex'), this.directClient.getGuid(), Buffer.from(refreshed.a1106Hex, 'hex'), persisted.nick)
      }
      this.directClient.setSession(session)

      try {
        await registerOnline(this.directClient)
        if (this.initToken !== myToken || this.directClient.getSession() !== session) return
        this.logger.info('[QQ Server] Online registered!')
        this.selfInfo.uin = persisted.uin
        this.selfInfo.uid = persisted.uid
        if (persisted.nick) this.selfInfo.nick = persisted.nick
        this.selfInfo.online = true
        // 断线重连时用它恢复 session
        this.runtimeUinOverride = persisted.uin
        this.directStopHeartbeat = startHeartbeat(this.directClient)
        // 上线后才开始遥测, 跟真机时序一致
        void this.directClient.startSsoReport()
        this.maybeEmitOnline()
        // 恢复的 session 可能没有 nick
        if (!this.selfInfo.nick) {
          this.scheduleFetchSelfNick(() => this.initToken === myToken && this.directClient?.getSession() === session)
        }
        return
      } catch (e) {
        if (this.initToken !== myToken || this.directClient.getSession() !== session) return
        // 连接留给扫码用: disconnect 会触发 close, native sign 的 relay 也会断
        this.logger.info('Saved session expired, will need QR login: %s', (e as Error).message)
        this.restoreError = (e as Error).message
        this.directClient.clearSession()
      }
    }

    if (this.initToken !== myToken) return
    if (!this.directClient.isConnected) await this.directClient.connect()
  }

  /** 每个实例接上 client 时调一次 */
  private bindDirectClientEvents(client: DirectProtocolClient): void {
    const on = (event: string, listener: (...args: any[]) => void) => {
      client.on(event, listener)
      this.clientListeners.push([event, listener])
    }
    on('session-expired', (uin: string, error: Error) => {
      const wasOnline = this.onlineEmitted
      this.selfInfo.online = false
      this.onlineEmitted = false
      authTokenStatus.loginError = error.message
      this.logger.warn('QQ session expired:', error.message)
      if (this.directStopHeartbeat) {
        this.directStopHeartbeat()
        this.directStopHeartbeat = null
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      // Remove only the rejected account's credentials; retain the device identity and native client.
      deleteSession(uin)
      this.runtimeUinOverride = null
      this.qrPollToken++
      this.initToken++
      this.directQrResult = null
      this.directPollResult = null
      this.resetQrState()
      setLoginState({ state: 'need_qrcode', qrcode_png_base64: undefined })
      if (wasOnline) {
        this.ctx.parallel('protocol/disconnect')
        this.ctx.parallel('qq/session-expired', error.message)
      }
      this.ensureQrLoop()
    })
    on('error', (err: Error) => {
      this.logger.warn('Direct client error:', err.message)
    })
    on('connected', () => {
      this.lastConnectedTime = Date.now()
    })
    on('close', () => {
      const wasOnline = this.onlineEmitted
      this.selfInfo.online = false
      if (this.directStopHeartbeat) {
        this.directStopHeartbeat()
        this.directStopHeartbeat = null
      }
      this.onlineEmitted = false
      if (wasOnline) {
        this.ctx.parallel('protocol/disconnect')
        // 只有主动 logout 不重连; 顶号时 session 已删, 重连会退回扫码
        if (!this.manualLogout) this.scheduleReconnect()
      }
    })
    on('push', (packet: { cmd: string; payload: Buffer }) => {
      // Unauthenticated traffic must not postpone the disconnect notification.
      if (client.isLoggedIn) this.lastConnectedTime = Date.now()
      this.ctx.parallel('qq/raw', { cmd: packet.cmd, payload: packet.payload })
    })
  }

  private startDirectQrPolling() {
    if (!this.directClient || !this.directQrResult) return
    const myToken = ++this.qrPollToken

    const poll = async () => {
      if (this.qrPollToken !== myToken) return
      if (!this.directClient || !this.directQrResult) return
      if (this.directClient.isLoggedIn) return

      try {
        const result = await pollQrCode(this.directClient, this.directQrResult.sig)
        if (this.qrPollToken !== myToken) return
        this.directPollResult = result

        if (result.state === QrCodeState.Confirmed) {
          await this.completeDirectLogin(myToken)
          return
        }

        if (result.state === QrCodeState.WaitingForConfirm) {
          setLoginState({ state: 'waiting_confirm' })
        }

        if (result.state === QrCodeState.Expired || result.state === QrCodeState.Cancelled) {
          const expired = result.state === QrCodeState.Expired
          // The code's age is the tell for server-side risk control: flagged devices get codes that die in seconds.
          const age = this.qrFetchedAt ? `${Math.round((Date.now() - this.qrFetchedAt) / 1000)}s` : '?'
          this.logger.info(expired ? `二维码已过期, 这张码用了 ${age}` : `手机端取消了扫码, 这张码用了 ${age}`)
          setLoginState({ state: expired ? 'expired' : 'cancelled' })
          this.invalidateQrCache()
          return
        }
      } catch (e) {
        if (this.qrPollToken !== myToken) return
        this.logger.warn('QR poll error:', (e as Error).message)
      }

      if (this.qrPollToken !== myToken) return
      setTimeout(poll, 2000)
    }

    setTimeout(poll, 2000)
  }

  private async completeDirectLogin(myToken: number) {
    const client = this.directClient
    const pollResult = this.directPollResult
    const qrResult = this.directQrResult
    if (this.qrPollToken !== myToken || !client || !pollResult || !qrResult) return
    this.manualLogout = false

    // watch 的 uin 在 poll 的 confirm 里, 桌面走 getCorrectUin
    let uin: number
    if (getActiveProfile().family === 'watch') {
      uin = Number(pollResult.uin || 0)
      if (!uin) {
        this.logger.error('watch 登录: poll confirm 未拿到 uin, 无法继续')
        return
      }
    } else {
      const urlParams = new URL(qrResult.url).searchParams
      const qrSig = urlParams.get('k') || ''
      uin = await getCorrectUin(AppInfo.appId, qrSig)
      if (this.qrPollToken !== myToken) return
      pollResult.uin = String(uin)
    }

    const loginResult = await loginWithQrResult(client, pollResult, () => this.qrPollToken === myToken)
    if (this.qrPollToken !== myToken) return
    if (!loginResult.success) {
      this.logger.error(`Login failed: state=${loginResult.state} ${loginResult.tag} ${loginResult.message}`)
      authTokenStatus.loginError = `登录失败: ${[loginResult.tag, loginResult.message].filter(Boolean).join(' ')}`.trim()
      return
    }

    const session = client.getSession()
    if (!session) return

    await client.awaitSignTokenAcquire()
    if (this.qrPollToken !== myToken || client.getSession() !== session) return

    // 上线失败要清掉半成品 session: 不然 isLoggedIn 为 true, 扫码 loop 不再出码, 成了收不到 MsgPush 的"假在线"
    try {
      await registerOnline(client)
    } catch (e) {
      if (this.qrPollToken !== myToken || client.getSession() !== session) return
      const msg = (e as Error).message
      this.logger.error('Register online failed:', msg)
      authTokenStatus.loginError = `上线注册失败: ${msg}`
      client.clearSession()
      return
    }
    // A completed request may resume after invalidation or a newer login attempt.
    if (this.qrPollToken !== myToken || client.getSession() !== session) return

    this.logger.info(`Login successful! UID: ${loginResult.uid}, nick: "${loginResult.nick}"`)
    saveSession(session, pollResult.tgtgtKey!, client.getGuid(), loginResult.tempPassword, loginResult.nick)

    this.directStopHeartbeat = startHeartbeat(client)
    // 上线后才开始遥测, 跟真机时序一致
    void client.startSsoReport()

    this.selfInfo.uin = String(uin)
    this.selfInfo.uid = loginResult.uid
    this.selfInfo.nick = loginResult.nick
    this.selfInfo.online = true
    // 断线重连时用它恢复 session
    this.runtimeUinOverride = String(uin)
    this.maybeEmitOnline()
    if (!this.selfInfo.nick) {
      this.scheduleFetchSelfNick(() => this.qrPollToken === myToken && client.getSession() === session)
    }
  }
}
