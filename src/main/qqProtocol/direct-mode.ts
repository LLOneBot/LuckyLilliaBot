import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Context } from 'cordis'
import QRCode from 'qrcode'
import { selfInfo, authTokenStatus, TEMP_DIR } from '@/common/globalVars'
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
  listAvailableSessions,
  persistedToSessionInfo,
  getSpecifiedUin,
  getSessionFilePathForUin,
} from './direct'
import type { QrCodeResult, QrPollResult } from './direct'
import { overwriteMachineGuid } from './direct/machineGuid'
import { updateAuthToken } from './direct/sign'
import { authTokenUtil, getAllowedUins } from '../config'
import { setLoginState } from '../llbot-ipc'
import { version } from '../../version'
import { startAuthTokenWatcher } from './direct/authTokenWatcher'
import { QQProtocolBase } from './base'

/**
 * Direct 模式实现: 走 native sign + TCP 直连. QQ 未登录 -> WebUI 扫码.
 * 内部持有一个低层 native `DirectProtocolClient` (direct/client.ts, 不要跟本类混淆).
 */
export class DirectQQProtocol extends QQProtocolBase {
  private directClient: DirectProtocolClient | null = null
  private directInitInFlight: boolean = false
  private directPendingToken: string = ''
  private directQrResult: QrCodeResult | null = null
  private directPollResult: QrPollResult | null = null
  private directStopHeartbeat: (() => void) | null = null
  // 每次 fetchQrCode 都 ++, 旧 poll 循环发现 token 变了就自动退出, 避免刷新二维码后累积多条并行 poll 链
  private qrPollToken: number = 0
  // QR 缓存 -- 后端是唯一持有者, WebUI 只拉缓存, 不触发新 fetch. TTL 到期或 pollQrCode 报 Expired/Cancelled
  // 后由 refreshQrCodeIfStale() 主动向 QQ 服务器拉新码, 保持终端 QR / WebUI QR 两侧一致.
  private qrFetchedAt: number = 0
  private static readonly QR_TTL_MS = 180_000
  // 上次已打印到终端的 QR sig, 用于去重: 后端每次拉到新码才重新打印, 避免刷新 loop 多次 dump 同一张
  private lastPrintedQrSig: string = ''

  // 扫码 loop 状态: 之前在 main.ts 作为闭包变量; 现在归实例.
  private loopRunning = false
  // 运行时指定要恢复的 session uin (WebUI 快速登录设一次, 下一次 initDirectClient 用它 loadSession).
  // 不影响 argv 的 -q, 只是补充: WebUI 需要用户运行时选账号
  private runtimeUinOverride: string | null = null

  constructor(ctx: Context) {
    super(ctx)
  }

  protected async start(): Promise<void> {
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
    this.ensureDirectLoginLoop()
  }

  /**
   * WebUI / 外部拉登录二维码 -- 只返回后端当前缓存的那张, **不会**向 QQ 服务器发新请求.
   * 缓存为空/过期时先由后端 refreshQrCodeIfStale() 拉一次. 保证终端 QR / WebUI QR 是同一张.
   */
  public async getLoginQrCode(): Promise<{ qrcodeUrl: string; pngBase64QrcodeData: string; expireTime: number; pollTimeInterval: number }> {
    if (!this.directClient) {
      throw new Error('Direct client not initialized')
    }
    await this.refreshQrCodeIfStale()
    const qr = this.directQrResult
    if (!qr) throw new Error('QR code unavailable')
    const remainingMs = Math.max(0, DirectQQProtocol.QR_TTL_MS - (Date.now() - this.qrFetchedAt))
    return {
      qrcodeUrl: qr.url,
      pngBase64QrcodeData: qr.image.length > 0
        ? 'data:image/png;base64,' + qr.image.toString('base64')
        : '',
      // 二维码剩余有效秒数 (WebUI FE 拿它 setTimeout 置 expired 显示"点击刷新")
      expireTime: Math.max(1, Math.floor(remainingMs / 1000)),
      // 兼容 FE QRCodeData 形状 (现无 use)
      pollTimeInterval: 3,
    }
  }

  /** 缓存无 / TTL 过期时向 QQ 服务器拉一张新码; 否则复用. WebUI 与后端 loop 都走这条. */
  private async refreshQrCodeIfStale(): Promise<void> {
    if (!this.directClient) return
    const fresh = this.directQrResult && Date.now() - this.qrFetchedAt < DirectQQProtocol.QR_TTL_MS
    if (fresh) return
    const qr = await fetchQrCode(this.directClient)
    this.directQrResult = qr
    this.qrFetchedAt = Date.now()
    this.startDirectQrPolling()
  }

  /** 让缓存立即过期. pollQrCode 检测到 Expired/Cancelled 时调, 下次 getLoginQrCode 就会拉新码. */
  private invalidateQrCache(): void {
    this.directQrResult = null
    this.qrFetchedAt = 0
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
      this.ensureDirectLoginLoop()
    } catch (e) {
      authTokenStatus.loginError = (e as Error)?.message || String(e)
      this.logger.error('[Sign] auth_token 校验通过但登录初始化失败:', e)
      throw e  // 交给 watcher: init 抛错(通常是 transient connect/网络)才定时重试自愈
    }
  }

  /** 幂等启动扫码 loop: 已在运行则不再起新链, 避免多条 setTimeout 链并行拉码 */
  private ensureDirectLoginLoop() {
    if (this.loopRunning) return
    this.directLoginLoop()
  }

  private directLoginLoop = async () => {
    if (selfInfo.online) { this.loopRunning = false; return }
    this.loopRunning = true
    if (!this.directClient?.isLoggedIn) {
      // 后端每秒 tick 一次, 但真正拉新码的节流由 refreshQrCodeIfStale 的 TTL (180s) 说了算.
      // 二维码有 sig 就复用, 到期或被 pollQrCode 主动 invalidate 才 fetch 新的 -- 保证同一时间
      // 全局只有一张 QR (终端 / png / Desktop / WebUI 拉到的都同源).
      this.printLoginQrCode()
      setTimeout(this.directLoginLoop, 1000)
    } else {
      // isLoggedIn 为真但 selfInfo.online 未置 (登录中 / register 失败清 session 前的中间态):
      // 继续轮询别停, 否则 register 失败 clearSession 后没有新码. 真在线由顶部 guard 停 loop.
      setTimeout(this.directLoginLoop, 1000)
    }
  }

  /**
   * 拉二维码 + 打印到终端 (ASCII) + 落盘 png + 推给 Desktop. 已按 sig 去重: 同一张码只打印一次,
   * 到期或被 poll invalidate 才会拿到新 sig 从而再次输出.
   */
  private async printLoginQrCode() {
    try {
      const data = await this.getLoginQrCode()
      const sig = this.directQrResult?.sig.toString('hex') || ''
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
    // 换账号 / 重试时取消上一轮残留的 QR poll loop (qrPollToken 变 -> 旧 poll 循环下一 tick 自退)
    this.qrPollToken++

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
      // 预检 persisted uin 是否在 token 授权列表: 不在的话 registerOnline 真 uin 签名会命中 compute 403
      // -> native process.exit. (native init 幂等, 重试时第二次 init 会跳过软失败的 /api/bu bind, 兜不住)
      const allowedRestore = await getAllowedUins(authToken)
      if (allowedRestore && !allowedRestore.includes(Number(persisted.uin))) {
        this.logger.error(`[Sign] persisted uin ${persisted.uin} 不在 auth_token 的 allowed_uins 中, 中止恢复登录`)
        authTokenStatus.loginError = `当前 QQ ${persisted.uin} 无法使用此 Auth Token（可能已达可用 QQ 数量上限）`
        return
      }
      this.logger.info('Found saved session for UIN %s (file: %s), attempting restore...', persisted.uin, getSessionFilePathForUin(persisted.uin))
      if (!this.directClient.isConnected) await this.directClient.connect()
      const session = persistedToSessionInfo(persisted)
      this.directClient.setSession(session)

      try {
        await registerOnline(this.directClient)
        console.log('[QQ Server] Online registered!')
        selfInfo.uin = persisted.uin
        selfInfo.uid = persisted.uid
        if (persisted.nick) selfInfo.nick = persisted.nick
        selfInfo.online = true
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
          // 让缓存立即失效, directLoginLoop 下一 tick 就会通过 refreshQrCodeIfStale 拉新码
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

    // Get UIN
    const urlParams = new URL(this.directQrResult.url).searchParams
    const qrSig = urlParams.get('k') || ''
    const uin = await getCorrectUin(AppInfo.appId, qrSig)
    this.directPollResult.uin = String(uin)

    // 预检: 当前 uin 是否在 token 的 allowed_uins 里. 不在的话, 稍后 registerOnline 用真 uin 签名
    // 会命中 /api/sign/compute 403, native SDK 直接 process.exit 崩进程 -- 所以在任何真 uin 签名前
    // 就拦下, 把原因回传 WebUI. 拿不到列表 (网络失败) 时放行, 交给后续流程.
    const allowed = await getAllowedUins(authTokenUtil.getToken())
    if (allowed && !allowed.includes(Number(uin))) {
      this.logger.error(`[Sign] uin ${uin} 不在 auth_token 的 allowed_uins 中, 中止登录`)
      authTokenStatus.loginError = `当前 QQ ${uin} 无法使用此 Auth Token（可能已达可用 QQ 数量上限）`
      return
    }

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
    this.maybeEmitOnline()
    if (!selfInfo.nick) this.scheduleFetchSelfNick()
  }
}
