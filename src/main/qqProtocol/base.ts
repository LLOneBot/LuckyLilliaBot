import { deepConvertMap, deepStringifyMap } from './util'
import { selfInfo } from '@/common/globalVars'
import { randomUUID, createHash } from 'node:crypto'
import path from 'node:path'
import { version } from '../../version'
import { Oidb, Msg } from '@/ntqqapi/proto'
import type {
  PMHQRes,
  PMHQReq,
  PMHQResSendPB,
  PBData,
  ResListener,
} from './types'
import { Context, Service } from 'cordis'
import { DirectProtocolClient, fetchQrCode, pollQrCode, loginWithQrResult, registerOnline, startHeartbeat, getCorrectUin, QrCodeState, AppInfo, saveSession, loadSession, persistedToSessionInfo, getSpecifiedUin, getSpecifiedSignHost, getSessionFilePathForUin, buildSsoInfoSync } from './direct'
import type { QrCodeResult, QrPollResult } from './direct'
import { overwriteMachineGuid } from './direct/machineGuid'
import { authTokenUtil } from '../config'
import { setLoginState } from '../llbot-ipc'
import { isPmhqMode } from '@/common/utils/environment'

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

export class QQProtocolBase extends Service {
  static inject = ['config']

  private reconnectTimer: NodeJS.Timeout | undefined
  protected httpUrl: string = 'http://127.0.0.1:13000'
  protected wsUrl: string = 'ws://127.0.0.1:13000/ws'
  protected ws: WebSocket | undefined
  private resListeners: Map<string, ResListener<any>> = new Map()
  private disconnectCallbacks: Map<string, DisconnectCallbackInfo> = new Map()
  private lastConnectedTime: number = Date.now()
  private disconnectCheckTimer: NodeJS.Timeout | undefined
  private hasConnectedOnce: boolean = false
  private hasLoggedConnectionError: boolean = false
  public msgPBMap: Map<string, string> = new Map<string, string>()
  private logger
  // 探测会话的取消令牌：每次 WS open 启动一次新的探测，token 自增；
  // 任何 setTimeout/listener 回调发现自己的 token 不是当前 token 就什么都不做并主动清理。
  private pmhqProbeToken: number = 0
  private onlineEmitted: boolean = false

  public directClient: DirectProtocolClient | null = null
  private directQrResult: QrCodeResult | null = null
  private directPollResult: QrPollResult | null = null
  private directStopHeartbeat: (() => void) | null = null

  constructor(protected ctx: Context) {
    super(ctx, 'qqProtocol')
    this.logger = ctx.logger('qq-protocol')
    const { pmhqHost, pmhqPort } = this.getPMHQHostPort()
    this.httpUrl = `http://${pmhqHost}:${pmhqPort}/`
    this.wsUrl = `ws://${pmhqHost}:${pmhqPort}/ws`
    if (isPmhqMode()) {
      this.connectWebSocket().then()
    }
  }

  private maybeEmitOnline() {
    if (this.onlineEmitted) return
    if (!selfInfo.online) return
    if (!selfInfo.uid && !selfInfo.uin) return
    this.onlineEmitted = true
    this.ctx.parallel('qq/online')
  }

  /**
   * emit qq/online 之后 ntUserApi 才会随插件加载. 用 ctx.inject 等它 ready 再拉一次 nick;
   * 拿到就写 selfInfo.nick, 失败就 warn 一下留空。
   */
  private scheduleFetchSelfNick(myToken: number) {
    this.ctx.inject(['ntUserApi'], async (ctx) => {
      if (this.pmhqProbeToken !== myToken) return
      try {
        const nick = await ctx.ntUserApi.getSelfNick(false)
        this.logger.info(`getSelfNick -> ${JSON.stringify(nick)}`)
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
   * PMHQ 模式下 LLBot 是寄生在 QQ NT 上的，QQ NT 早就登录过了，开机时的 InfoSyncPush 也早处理完。
   * LLBot 想要群最新 seq（拉历史用）就得自己主动触发一次：发 SsoInfoSync，server 看到注册请求就回一发 InfoSyncPush。
   * isFirstRegisterProxyOnline=0 + 派生 guid（基于 uid，每个号固定）尽量避免和 QQ NT 的注册项冲突。
   */
  private async triggerInfoSyncPush() {
    const seed = selfInfo.uid || selfInfo.uin || 'llbot'
    const guid: Buffer = createHash('md5').update(`llbot-${seed}`).digest().subarray(0, 16)
    const payload = buildSsoInfoSync(guid, false)
    await this.sendPB('trpc.msg.register_proxy.RegisterProxy.SsoInfoSync', payload, 5000)
    // 注意: 触发的 InfoSyncPush 响应当前在 dispatcher 里被丢弃 (没 decode/消费),
    // 群最新 seq 实际走 fetchGroupExtra。保留这次注册仅防潜在服务端副作用; 日志降到 debug。
    this.logger.debug('已主动触发 RegisterProxy.SsoInfoSync（PMHQ）')
  }

  private resetPmhqState() {
    const wasOnline = this.onlineEmitted
    selfInfo.online = false
    selfInfo.uid = ''
    selfInfo.uin = ''
    selfInfo.nick = ''
    this.pmhqProbeToken++
    this.onlineEmitted = false
    if (wasOnline) {
      this.ctx.parallel('protocol/disconnect')
    }
  }

  /**
   * PMHQ 模式：轮询 /health 拿 self uin/uid（DLL 从 QQ 内存直接读 uin,
   * injector 侧扫 recv pb 抠 uid, 都写到 /health）。拿到 uin+uid 立即 emit online,
   * nick 通过 scheduleFetchSelfNick 异步等 ntUserApi 服务 ready 后再拉。
   * 重连后会被 onopen 再次调用，所以必须先 reset 旧状态再启动新一轮。
   */
  private startPmhqLoginProbe() {
    this.resetPmhqState()
    const myToken = ++this.pmhqProbeToken

    let warnedNotLoggedIn = false
    const probe = async () => {
      if (this.pmhqProbeToken !== myToken) return
      try {
        const resp = await fetch(`${this.httpUrl}health`)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const health = await resp.json() as { uin?: number | null; uid?: string | null }
        if (this.pmhqProbeToken !== myToken) return

        if (health.uin && health.uid) {
          selfInfo.uid = health.uid
          selfInfo.uin = String(health.uin)
          this.ctx.logger.info(`Self info ${selfInfo.nick || '<pending>'}(${selfInfo.uin}) uid=${selfInfo.uid}`)
          if (!selfInfo.online) {
            this.logger.info('QQ 登录成功')
          }
          selfInfo.online = true
          this.maybeEmitOnline()
          // nick 得 emit online 之后再拉: ntUserApi 服务在 qq/online 触发的插件里才注册,
          // 在这之前 ctx.get('ntUserApi') 是 undefined。用 ctx.inject 等它 ready, 拉到就写。
          this.scheduleFetchSelfNick(myToken)
        } else if (!warnedNotLoggedIn) {
          this.logger.info('QQ 未登录，等待登录中...')
          warnedNotLoggedIn = true
        }
      } catch (e) {
        if (this.pmhqProbeToken !== myToken) return
        if (!warnedNotLoggedIn) {
          this.logger.info('PMHQ /health probe failed (QQ 未启动?), 继续等待: %s', (e as Error).message)
          warnedNotLoggedIn = true
        }
      }
      if (this.pmhqProbeToken !== myToken) return
      if (selfInfo.online) return
      setTimeout(probe, 600)
    }
    probe()
  }

  public get_is_connected() {
    // 直连模式：看 directClient 是否登录在线
    if (this.directClient) {
      return this.directClient.isLoggedIn
    }
    // PMHQ 模式：看 ws
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }

  public onDisconnect(timeout: number, callback: DisconnectCallback): string {
    const id = randomUUID()
    this.disconnectCallbacks.set(id, { timeout, callback, triggered: false })
    // console.info(`[PMHQ] Registered disconnect callback ${id} with timeout ${timeout}ms`)
    return id
  }

  public offDisconnect(id: string): void {
    this.disconnectCallbacks.delete(id)
  }

  private startDisconnectMonitoring() {
    if (this.disconnectCheckTimer) return

    // console.info('[PMHQ] Starting disconnect monitoring')
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
            this.logger.warn(`[PMHQ] Triggering disconnect callback, duration: ${disconnectedDuration}ms, timeout: ${info.timeout}ms`)
            try {
              info.callback(disconnectedDuration)
            } catch (e) {
              this.logger.error('PMHQ disconnect callback error', e)
            }
          }
        }
      }
    }, 5000)
  }

  private getPMHQHostPort() {
    let pmhqPort = '13000'
    let pmhqHost: string = '127.0.0.1'
    for (const pArg of process.argv) {
      if (pArg.startsWith('--pmhq-port=')) {
        pmhqPort = pArg.replace('--pmhq-port=', '')
      } else if (pArg.startsWith('--pmhq-host=')) {
        pmhqHost = pArg.replace('--pmhq-host=', '')
      }
    }
    return { pmhqPort, pmhqHost }
  }

  public addResListener<R extends PMHQRes>(listener: ResListener<R>) {
    const listenerId = randomUUID()
    this.resListeners.set(listenerId, listener)
    return listenerId
  }

  public removeResListener(listenerId: string) {
    this.resListeners.delete(listenerId)
  }

  private async connectWebSocket() {
    const reconnect = () => {
      this.ws = undefined
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = undefined
      }
      this.reconnectTimer = setTimeout(() => {
        this.connectWebSocket()
      }, 1000)
    }

    try {
      this.ws = new WebSocket(this.wsUrl)
    } catch (e) {
      return reconnect()
    }

    this.ws.onmessage = async (event) => {
      let data: PMHQRes
      try {
        data = JSON.parse(event.data.toString())
      } catch (e) {
        this.logger.error('解析 PMHQ 消息失败', event.data, e)
        return
      }
      data = deepConvertMap(data)
      for (const func of this.resListeners.values()) {
        setImmediate(() => {
          try {
            func(data)
          } catch (e) {
            this.logger.error('PMHQ res listener error', e)
          }
        })
      }
    }

    this.ws.onerror = () => {
      selfInfo.online = false
      this.resetPmhqState()

      if (!this.hasLoggedConnectionError) {
        this.logger.error('PMHQ WebSocket 连接错误，可能 QQ 未启动，正在等待 QQ 启动进行重连...')
        this.hasLoggedConnectionError = true
      }

      reconnect()
    }

    this.ws.onclose = () => {
      selfInfo.online = false
      this.resetPmhqState()

      if (!this.hasLoggedConnectionError) {
        this.logger.info('PMHQ WebSocket 连接关闭，准备重连...')
        this.hasLoggedConnectionError = true
      }

      reconnect()
    }

    this.ws.onopen = () => {
      this.logger.info('PMHQ WebSocket 连接成功')
      this.hasLoggedConnectionError = false
      if (!this.hasConnectedOnce) {
        this.hasConnectedOnce = true
        this.startDisconnectMonitoring()
      }
      // 每次（重）连成功后重新走一遍登录探测
      this.startPmhqLoginProbe()
    }
  }

  public async waitConnected() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve(true)
        } else {
          setTimeout(check, 1000)
        }
      }
      check()
    })
  }

  public async wsSend<R extends PMHQRes>(data: PMHQReq, timeout = 15000): Promise<R> {
    await this.waitConnected()
    let echo = data.data?.echo
    if (!data.data?.echo) {
      echo = randomUUID()
      data.data.echo = echo
    }
    const payload = JSON.stringify(deepStringifyMap(data))
    const p = new Promise<R>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('pmhq ws send: wait result timeout'))
        this.removeResListener(listenerId)
      }, timeout)
      const listenerId = this.addResListener<R>((res) => {
        if (!res.data) {
          this.logger.error(`PMHQ WS send error: payload ${JSON.stringify(data)}, response ${JSON.stringify(res)}`)
        }
        if (res.data?.echo == echo) {
          resolve(res)
          clearTimeout(timeoutId)
          this.removeResListener(listenerId)
        }
      })
    })
    this.ws!.send(payload)
    return p
  }

  public async httpSend<R extends PMHQRes>(data: PMHQReq): Promise<R> {
    const payload = JSON.stringify(deepStringifyMap(data))
    const response = await fetch(this.httpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`PMHQ请求失败，请检查发包器PMHQ设置 ${response.status} - ${errorBody}`)
    }
    let result = await response.json()
    result = deepConvertMap(result)
    return result
  }

  /**
   * 解包 PMHQ active-send 响应。echo 只用于关联请求, 不能"echo 匹配就算成功":
   * PMHQ 即使发包失败 / QQ 未登录, 也会回一条 echo 匹配但 code 非 0 的响应。
   * 成败一律看 code: 0 = QQ 真回包(已登录); 非 0(-100 未登录/KernelMsgService 缺失/管道未连,
   * 或 QQ app error) 一律抛错, 不让上层拿空 pb 去 decode。
   */
  private unwrapPmhqRes(res: PMHQResSendPB, cmd: string): PBData {
    if (res.code != null && res.code !== 0) {
      // 带上响应 pb 做诊断: 非空 = 服务器回了 OIDB 错误体(可 decode 看 errorMsg);
      // 空 = QQ NT 客户端侧就拒了(多半 sign / 命令校验), 根本没到服务器。
      const pb = res.data?.pb ?? ''
      const detail = pb ? ` pb=${pb.slice(0, 160)}` : ' pb=<empty>'
      throw new Error(`PMHQ send failed: cmd=${cmd} code=${res.code} ${res.message ?? ''}${detail}`.trim())
    }
    return res.data
  }

  public async sendPB(cmd: string, pb: Buffer | string, timeout = 15000): Promise<PBData> {
    // Direct mode: send through TCP directly
    if (this.directClient?.isLoggedIn) {
      const buf = Buffer.isBuffer(pb) ? pb : Buffer.from(pb, 'hex')
      const resp = await this.directClient.sendCommand(cmd, buf, undefined, timeout)
      return {
        cmd,
        pb: resp.payload.toString('hex'),
      }
    }
    const hex = Buffer.isBuffer(pb) ? pb.toString('hex') : pb
    if (this.ws?.readyState === WebSocket.OPEN) {
      return this.unwrapPmhqRes(
        await this.wsSend<PMHQResSendPB>({ type: 'send', data: { cmd, pb: hex } }, timeout),
        cmd,
      )
    }
    return this.unwrapPmhqRes(
      await this.httpSend<PMHQResSendPB>({ type: 'send', data: { cmd, pb: hex } }),
      cmd,
    )
  }

  /**
   * 发送 OIDB 命令，自动 encode Oidb.Base、发送、decode 响应。
   */
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

  startHook() {
    this.addResListener((data: any) => {
      if (data?.type === 'recv' && data.data?.cmd && data.data?.pb) {
        const payload = Buffer.from(data.data.pb, 'hex')
        this.ctx.parallel('qq/raw', { cmd: data.data.cmd, payload })
      }
    })
  }

  // --- Direct Protocol Integration ---

  /**
   * Initialize direct protocol client and attempt session restore.
   * Call this in place of (or alongside) connectWebSocket when using direct protocol.
   *
   * 启动前 client.preflightSign() 一次: token / 鉴权 / 远端 sign-service 任一不通,
   * 直接 throw, 不让后续 connect / register / restore 跑下去.
   */
  async initDirectClient(): Promise<void> {
    const authToken = authTokenUtil.getToken() || process.env.AUTH_TOKEN || undefined
    if (!authToken) {
      const tokenPath = authTokenUtil.getPath()
      const tokenFile = path.basename(tokenPath)
      this.logger.error(
        `[Sign Preflight] auth_token 未设置 (文件 ${tokenPath} 为空 / 不存在). ` +
        `请到 https://auth.luckylillia.com 获取 token, 粘贴到 ${tokenFile}, 然后重启.`
      )
      throw new Error('auth token not configured')
    }

    // 先 loadSession 拿 (uin, guid), 再 new DirectProtocolClient -- 让 sign 那侧
    // init 时就拿到 uin 和 device GUID, 不用后续补救.
    const specifiedUin = getSpecifiedUin()
    if (specifiedUin) {
      this.logger.info('Specified login uin via -q/--qq: %s, will try qq-session-%s.json', specifiedUin, specifiedUin)
    } else {
      this.logger.info('No -q/--qq specified, will perform fresh QR login (session will be saved as qq-session-<uin>.json)')
    }
    const persisted = loadSession()

    // session.guid 跟 machine_guid.bin 不一致时以 session 为准, 落盘同步,
    // 保证 new Client 构造里 loadMachineGuidSync 读到的就是它.
    if (persisted) {
      overwriteMachineGuid(Buffer.from(persisted.guid, 'hex'))
    }

    const uinForInit = persisted ? Number(persisted.uin) : undefined
    this.directClient = new DirectProtocolClient({
      authToken: authToken,
      botVersion: `LLBot_${version}`,
      uin: Number.isFinite(uinForInit) && (uinForInit as number) > 0 ? uinForInit : undefined,
    })

    this.directClient.on('error', (err: Error) => {
      this.logger.warn('Direct client error:', err.message)
    })
    this.directClient.on('close', () => {
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
    this.directClient.on('push', (packet: { cmd: string; payload: Buffer }) => {
      this.ctx.parallel('qq/raw', { cmd: packet.cmd, payload: packet.payload })
    })

    if (persisted) {
      this.logger.info('Found saved session for UIN %s (file: %s), attempting restore...', persisted.uin, getSessionFilePathForUin(persisted.uin))
      await this.directClient.connect()
      const session = persistedToSessionInfo(persisted)
      this.directClient.setSession(session)

      try {
        const msg = await registerOnline(this.directClient)
        console.log('[QQ Server] Online registered!')
        selfInfo.uin = persisted.uin
        selfInfo.uid = persisted.uid
        if (persisted.nick) selfInfo.nick = persisted.nick
        selfInfo.online = true
        this.directStopHeartbeat = startHeartbeat(this.directClient)
        this.maybeEmitOnline()
        return
      } catch (e) {
        this.logger.info('Saved session expired, will need QR login: %s', (e as Error).message)
        this.directClient.clearSession()
        this.directClient.disconnect()
      }
    }

    // Connect fresh (will need QR login)
    await this.directClient.connect()
  }

  /**
   * Check if logged in via direct protocol
   */
  isDirectLoggedIn(): boolean {
    return this.directClient?.isLoggedIn ?? false
  }

  /**
   * Get self info for direct protocol (matches the shape used by main.ts checkLogin)
   */
  getDirectSelfInfo(): { uin: string; uid: string; nick: string; online: boolean } {
    if (!this.directClient?.isLoggedIn) {
      return { uin: '', uid: '', nick: '', online: false }
    }
    const session = this.directClient.getSession()
    return {
      uin: session?.uin || '',
      uid: session?.uid || '',
      nick: '',
      online: true,
    }
  }

  /**
   * Fetch QR code via direct protocol.
   * Returns same shape as ntLoginApi.getLoginQrCode() for compatibility.
   */
  async getDirectLoginQrCode(): Promise<{ qrcodeUrl: string; pngBase64QrcodeData: string }> {
    if (!this.directClient) {
      throw new Error('Direct client not initialized')
    }

    const qr = await fetchQrCode(this.directClient)
    this.directQrResult = qr

    // Start background polling
    this.startDirectQrPolling()

    return {
      qrcodeUrl: qr.url,
      pngBase64QrcodeData: qr.image.length > 0
        ? 'data:image/png;base64,' + qr.image.toString('base64')
        : '',
    }
  }

  private startDirectQrPolling() {
    if (!this.directClient || !this.directQrResult) return

    const poll = async () => {
      if (!this.directClient || !this.directQrResult) return
      if (this.directClient.isLoggedIn) return

      try {
        const result = await pollQrCode(this.directClient, this.directQrResult.sig)
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
          // 失效后置状态并清掉旧码; main.ts directLoginLoop 会立即重新拉新码 -> need_qrcode
          setLoginState({ state: result.state === QrCodeState.Expired ? 'expired' : 'cancelled' })
          this.directQrResult = null
          return
        }
      } catch (e) {
        this.logger.warn('QR poll error:', (e as Error).message)
      }

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

    // wtlogin.login
    const loginResult = await loginWithQrResult(this.directClient, this.directPollResult)
    if (!loginResult.success) {
      this.logger.error(`Login failed: state=${loginResult.state} ${loginResult.tag} ${loginResult.message}`)
      return
    }

    this.logger.info(`Login successful! UID: ${loginResult.uid}, nick: "${loginResult.nick}"`)

    // Save session
    const session = this.directClient.getSession()!
    saveSession(session, this.directPollResult.tgtgtKey!, this.directClient.getGuid(), loginResult.tempPassword, loginResult.nick)

    // Register online
    try {
      await registerOnline(this.directClient)
    } catch (e) {
      this.logger.warn('Register:', (e as Error).message)
    }

    // Start heartbeat
    this.directStopHeartbeat = startHeartbeat(this.directClient)

    // Update global state
    selfInfo.uin = String(uin)
    selfInfo.uid = loginResult.uid
    selfInfo.nick = loginResult.nick
    selfInfo.online = true
    this.maybeEmitOnline()
  }
}
