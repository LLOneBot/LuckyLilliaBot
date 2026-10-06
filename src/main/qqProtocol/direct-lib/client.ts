import { getLogger, isDebugEnabled } from '@/common/logger'
import { TcpConnection } from './connection'
import { buildServicePacket, buildServicePacket13, parseServicePacket, EncryptType, PacketContext, SsoPacket } from './packet'
import { generateEcdhKeyPair, EcdhKeyPair } from './ecdh'
import { generateWatchEcdhKeyPair } from './watch/ecdh'
import { requestSign, setupSign, setSignMachineGuid, acquireSignToken, acquireMacosEskOnly, startLinuxSsoReport, stopLinuxSsoReport, buildLinuxXwidBody, signLinuxXwidBurst, SignResult, type MacosEskState } from './sign'
import { AppInfo } from './appInfo'
import { getActiveProfile } from './profiles'
import { loadMachineGuidSync } from './machineGuid'
import { EventEmitter } from 'node:events'
import { CmdNotPermittedError, CMD_NOT_PERMITTED_RET_CODE } from '@/common/protocolErrors'
import { isCmdAllowed, CmdBlockedError, logCmdWhitelistStatus } from './cmdWhitelist'
import { cmdNeedsSign } from './cmd'
import { recordKey } from './packetDump'
import {
  buildGetNewFlag, buildClientReport, buildPsKey, TELEMETRY_CMDS,
  buildPsKey102a1, build116d1, build9067202, buildSsoGetConfig, AUX_TELEMETRY_CMDS,
} from './telemetry'
import { parseConfigPushReq, buildConfigPushResp, CONFIG_PUSH_REQ, CONFIG_PUSH_RESP } from './configPush'

const logger = getLogger('direct')

// Linux 登录 xwid 突发条数。真机登录瞬间连号发 ~2500 条 (实测 ~1ms/包、~1000/s、摊 ~2.5s;
// 非"微秒瞬时", sign 在进程内 sub-ms)。我们批量签 (一次 NAPI, sign-core ~450k/s) + 分块 pace 复刻。
// 默认 2000 对齐真机 (~2523)。大量突发理论上有踩服务端限流的风险, 要调小/关掉设 env LINUX_XWID_BURST
// (如 1); pace 默认 1000/s (LINUX_XWID_BURST_RATE) 已摊到 ~2s, 跟真机节奏一致, 非瞬发尖峰。
// 2026-10-06 真机 691 登录抓包实证: 登录瞬间 SsoReport xwid 爆发 = ~948 条 (背靠背)。
// 2026-10-05 曾怀疑"突发触发风控"把默认砍到 1 -> Bot 登录只发 4 条 SsoReport, 跟真机 ~948 差了两个数量级;
// 实测证明爆发是真机正常行为, 缺了它才是"非真客户端"信号。还原默认到真机量级。env 仍可覆盖。
const LINUX_XWID_BURST = Math.max(0, Number(process.env.LINUX_XWID_BURST || '2000') | 0)
// 发送速率 (包/秒), 默认 1000 对齐真机; 设很大 (如 999999) = 瞬发不 pace。分块 pace 避免尖峰触发限流。
const LINUX_XWID_BURST_RATE = Math.max(1, Number(process.env.LINUX_XWID_BURST_RATE || '1000') | 0)

export interface DirectClientConfig {
  appId: number
  subAppId: number
  ssoVersion: number
  buildVer: string
  useIPv6?: boolean
  /** 一次性 token, 由用户在 manager-web 生成后粘贴到 data/auth_token.txt. 跟 sign 请求一起发. */
  authToken?: string
  /** LuckyLillia.Bot 版本号 (env-report 带上). */
  botVersion?: string
  /** 数据目录 (存 device_ids.json 等跨重启稳定指纹). 默认 'data'. */
  dataDir?: string
  /** 当前账号 uin, 可选. */
  uin?: number
  /** 接入点 CDN: 'cf' (默认) / 'china'. 传给 SignProxy 决定 base_url + TLS pin. */
  cdn?: string
}

const DEFAULT_CONFIG: DirectClientConfig = {
  appId: AppInfo.appId,
  subAppId: AppInfo.subAppId,
  ssoVersion: AppInfo.ssoVersion,
  buildVer: AppInfo.buildVer,
  useIPv6: false,
}

export interface SessionInfo {
  uin: string
  uid: string
  d2: Buffer
  d2Key: Buffer
  tgt: Buffer
  a2: Buffer
  a2Key: Buffer
  sKey: Buffer
  /** 12B ASCII sign-token, 走 SignProxy.acquireSignToken 拿到. 跟 authToken 不是一个东西. */
  signToken12B?: string
  signTokenExpiresAt?: number
}

export class DirectProtocolClient extends EventEmitter {
  private conn: TcpConnection
  private config: DirectClientConfig
  private ecdhKeyPair: EcdhKeyPair
  private guid: Buffer
  private seq = (Math.random() * 0x00FFFFFF) >>> 0
  private session: SessionInfo | null = null
  private signSetupDone = false
  private pendingPackets: Map<number, {
    resolve: (packet: SsoPacket) => void
    reject: (err: Error) => void
    timeout: NodeJS.Timeout
  }> = new Map()
  private signTokenRefreshInflight: Promise<void> | null = null
  private signTokenLastFetchAt = 0
  // macOS ESK channel (token1 + keys), scoped to one TCP connection: dropped on close and
  // re-established once its TTL lapses. See ensureMacosEsk / protocolTokenFor.
  private macosEskState: MacosEskState | null = null
  // Bumped on every close, so an ESK still in flight when its connection dies gets discarded.
  private connEpoch = 0
  private heartbeatAliveTimer: NodeJS.Timeout | null = null
  private telemetryTimer: NodeJS.Timeout | null = null
  private auxTelemetryTimer: NodeJS.Timeout | null = null
  // 计时诊断: 按 seq 记响应帧「进 handlePacket」的时刻, 拆 wire vs parse.
  private frameArriveAt: Map<number, number> = new Map()
  // event loop lag 采样: setInterval 期望 50ms 一跳, 实测跳间隔 - 50 = 主线程被阻塞的量.
  private maxLoopLag = 0
  private loopLagTimer: NodeJS.Timeout | null = null
  private lastLoopTick = 0
  // 撞过 -10122 的 cmd. 产品线权限是固定的, 记下来别每次都白发一遍 —— 拉历史这类调用方没有
  // 自己的缓存, 不记的话 WebUI 每翻一页就多一个注定被拒的包.
  private unsupportedCmds = new Set<string>()

  constructor(config: Partial<DirectClientConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.guid = loadMachineGuidSync()
    // sign 初始化不在构造函数里做 -- native init 现在是 async (传 uin 时 await /api/bu bind),
    // 构造函数没法 await. 挪到 connect() 顶部, 由调用方 await. 见 ensureSignSetup.
    this.conn = new TcpConnection()
    // watch wtlogin 用 P-256, 桌面用 secp192k1
    this.ecdhKeyPair = getActiveProfile().family === 'watch' ? generateWatchEcdhKeyPair() : generateEcdhKeyPair()
    recordKey('ecdh.privateKey', this.ecdhKeyPair.privateKey, 'wtlogin ECDH, per client instance')
    recordKey('ecdh.publicKey', this.ecdhKeyPair.publicKey, 'sent in the wtlogin frame head')
    recordKey('ecdh.shareKey', this.ecdhKeyPair.shareKey, 'TEA key of every wtlogin body')
    recordKey('device.guid', this.guid, 'machine guid')

    this.conn.on('packet', (frame: Buffer) => this.handlePacket(frame))
    this.conn.on('error', (err) => this.emit('error', err))
    this.conn.on('close', () => {
      // 连接断开必须停 timer: client 是进程单例不重建, 不停的话断线期间会一直往死连接发包,
      // 且重连 connect() 的幂等 guard 会误判"已在跑"而不重启. 停掉才能让重连干净重启.
      this.stopHeartbeatAlive()
      this.stopTelemetry()
      this.connEpoch++
      this.macosEskState = null
      this.emit('close')
    })
  }

  /**
   * 起 sign 链路: 建 native Client + 注册 send_packet/logger; 配置里带了 uin 时 await /api/bu bind.
   * native init 是 async, 必须在能 await 的地方跑 (不能塞构造函数) -- 故由 connect() 调.
   * 幂等: 二次调直接返回 (native init 二次也是 no-op). bind 失败时 reject 会从 connect() 冒出去.
   */
  private async ensureSignSetup(): Promise<void> {
    if (this.signSetupDone || !this.config.authToken) return
    this.signSetupDone = true
    await setupSign({
      botVersion: this.config.botVersion ?? 'unknown',
      authToken: this.config.authToken,
      machineGuid: this.guid,
      uin: this.config.uin,
      cdn: this.config.cdn,
      sendPacket: async ({ cmd, body, signToken }) => {
        const req = Buffer.from(body)
        // [SA 1001 调查 / 最小验证 A] o3 ecdh_access 命令 (ESK/SA) 真机走 enc0x02 零钥握手通道
        // (scan.pcap 实测 ESK/SA 都是 enc0x02 + A2 + sign)。登录后 sendCommand 默认 enc0x01
        // d2key, 会让 SA 返业务码 1001。这里强制 ESK/SA 走 EncryptEmpty, 验证"通道假设"。
        // SsoReport 等其它 o3 命令 (trpc.o3.report.*) 不受影响, 照常 enc0x01。
        // 详见 LuckyLillia.Sign/docs/Linux/sign-token-protocol-final.md "SA 1001"。
        const enc = cmd.includes('.o3.ecdh_access.') ? EncryptType.EncryptEmpty : undefined
        // [SA 1001 修复] signToken 覆盖本命令的 SecInfo sf2 / 签名 token: SA 带 token1, 其它为空。
        const resp = (await this.sendCommand(cmd, req, enc, undefined, undefined, signToken || undefined)).payload
        logger.debug(`[relay] ${cmd} enc=${enc === undefined ? 'auto' : enc} signTok=${signToken ? signToken.length + 'B' : '-'}: req=${req.length}B resp=${resp.length}B reqHex=%h respHex=%h`, req, resp)
        return resp
      },
    })
  }

  async connect(): Promise<void> {
    logCmdWhitelistStatus()
    // sign 链路 init (signRequest 依赖); token 有效性不在此 preflight —— 已移到 WebUI 侧
    // 的 HTTP 校验 (validateAuthToken). 旧 preflightSign 在 token 无效(401/403)时会触发
    // native SDK 内部 process.exit, 会把整个 bot 进程带崩, 故移除.
    await this.ensureSignSetup()
    await this.conn.connect({ useIPv6: this.config.useIPv6 })
    this.emit('connected')
    this.startLoopLagMonitor()

    // Send initial heartbeat (required before other commands)
    await this.sendHeartbeat()
    this.startHeartbeatAlive()
  }

  /**
   * macOS: ESK after connect and before trans_emp / session restore, as real clients do (PoC
   * main.rs 1322-1362). No-op on other protocols or while this connection's ESK is still live.
   * Failures only warn; the post-login token acquire retries ESK.
   */
  async acquirePreLoginToken(): Promise<void> {
    await this.ensureMacosEsk()
  }

  private liveMacosEsk(): MacosEskState | null {
    const esk = this.macosEskState
    return esk && Date.now() < esk.expiresAt ? esk : null
  }

  /** This connection's live ESK, running ESK first if there is none. null on other protocols or on failure. */
  private async ensureMacosEsk(): Promise<MacosEskState | null> {
    if (getActiveProfile().name !== 'macos' || !this.config.authToken) return null
    const live = this.liveMacosEsk()
    if (live) return live
    const epoch = this.connEpoch
    try {
      const esk = await acquireMacosEskOnly(AppInfo.qua)
      // The connection closed while ESK was in flight; its channel must not leak into the next one.
      if (epoch !== this.connEpoch) return null
      this.macosEskState = esk
      logger.info(`[SignToken] macOS ESK acquired (token ${esk.token.length}B) ttl=${esk.ttlSecs}s`)
      return esk
    } catch (e) {
      logger.warn(`[SignToken] macOS ESK failed: ${(e as Error).message}`)
      return null
    }
  }

  /**
   * Device token for a sign request. macOS follows PoC main.rs send(): the o3 handshake cmds
   * (ESK / A2 / SA2) always carry an empty one, and after login business cmds carry sa2_token,
   * falling back to a live ESK token1 until SA2 lands. Other protocols keep the session token.
   * signToken12B === '' is the 403 soft-degrade and must not fall back to ESK.
   */
  private protocolTokenFor(cmd: string): string | undefined {
    if (getActiveProfile().name !== 'macos') return this.session?.signToken12B
    if (!this.session || cmd.includes('ecdh_access')) return undefined
    return this.session.signToken12B ?? this.liveMacosEsk()?.token
  }

  /** 周期性发 Heartbeat.Alive 保活连接层. connect() 启动, disconnect()/close 清理. 幂等. */
  private startHeartbeatAlive(): void {
    if (this.heartbeatAliveTimer) return
    // 真机 3.2.28 Heartbeat.Alive ~13.5s 一跳且带自然抖动。写死的 10.000s setInterval 本身是机器特征,
    // 故自调度 setTimeout 带每跳抖动 (~12-15s), 对齐真机节奏。
    const tick = () => {
      this.sendHeartbeat().catch((e) => {
        logger.error('[Heartbeat.Alive] Failed:', (e as Error).message)
      })
      this.heartbeatAliveTimer = setTimeout(tick, 12_000 + Math.floor(Math.random() * 3_000))
    }
    this.heartbeatAliveTimer = setTimeout(tick, 12_000 + Math.floor(Math.random() * 3_000))
  }

  private stopHeartbeatAlive(): void {
    if (this.heartbeatAliveTimer) {
      clearTimeout(this.heartbeatAliveTimer)
      this.heartbeatAliveTimer = null
    }
  }

  /**
   * 稳态遥测 loop. 真机 3.2.28 登录后每 ~316s 必发 getNewFlag + ClientReport + 0x102a_0(psKey);
   * Bot 原来登录后只有心跳 = "哑连接", 是风控判会话失效 (KickNT 1001 登录已失效) 的最强信号。
   * 对齐真机周期性发这组遥测。fire-and-forget: 单条失败只 debug, 不影响主链路。linux only。
   * 由 startLinuxSsoReportLoop() 上线后启动, close/disconnect 停。
   */
  private startTelemetryLoop(): void {
    if (this.telemetryTimer || getActiveProfile().name !== 'linux') return
    const tick = () => {
      void this.sendTelemetryRound()
      // 真机 ~316-317s; 带抖动避免机械规律。
      this.telemetryTimer = setTimeout(tick, 310_000 + Math.floor(Math.random() * 15_000))
    }
    this.telemetryTimer = setTimeout(tick, 310_000 + Math.floor(Math.random() * 15_000))
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) {
      clearTimeout(this.telemetryTimer)
      this.telemetryTimer = null
    }
    if (this.auxTelemetryTimer) {
      clearTimeout(this.auxTelemetryTimer)
      this.auxTelemetryTimer = null
    }
  }

  /**
   * 低频 aux 遥测 loop. 真机 691 ~26-30min 偶发一组 0x102a_1 / 0x116d_1 / 0x9067_202 / SsoGetConfig
   * (非每轮主遥测), Bot 原来一条不发。补齐这块"真机客户端"完整度。首发延后避开登录爆发, 之后 ~27min
   * 带抖动。fire-and-forget, linux only。随主 telemetry 一起由 stopTelemetry() 停。
   */
  private startAuxTelemetryLoop(): void {
    if (this.auxTelemetryTimer || getActiveProfile().name !== 'linux') return
    const tick = () => {
      void this.sendAuxTelemetryRound()
      this.auxTelemetryTimer = setTimeout(tick, 1_500_000 + Math.floor(Math.random() * 360_000))
    }
    this.auxTelemetryTimer = setTimeout(tick, 300_000 + Math.floor(Math.random() * 120_000))
  }

  /** 发一组 aux 遥测。0x102a_1 在 sign 白名单会自动签 (对齐真机 f24), 其余不签。各条独立 try。 */
  private async sendAuxTelemetryRound(): Promise<void> {
    if (!this.session || !this.isConnected) return
    const uid = this.session.uid
    const guidHex = this.guid.toString('hex')
    const jobs: Array<[string, Buffer]> = [
      [AUX_TELEMETRY_CMDS.psKey102a1, buildPsKey102a1()],
      [AUX_TELEMETRY_CMDS.oidb116d1, build116d1(uid)],
      [AUX_TELEMETRY_CMDS.oidb9067202, build9067202()],
      [AUX_TELEMETRY_CMDS.ssoGetConfig, buildSsoGetConfig(guidHex)],
    ]
    for (const [cmd, body] of jobs) {
      if (!this.session || !this.isConnected) break
      try {
        await this.sendCommand(cmd, body)
      } catch (e) {
        logger.debug(`[aux-telemetry] ${cmd} failed: ${(e as Error).message}`)
      }
    }
  }

  /** 发一轮稳态遥测 (getNewFlag + ClientReport + psKey)。各条独立 try, 单条失败不影响其余。 */
  private async sendTelemetryRound(): Promise<void> {
    if (!this.session || !this.isConnected) return
    const uin = this.session.uin ? Number(this.session.uin) : (this.config.uin || 0)
    if (!uin) return
    const jobs: Array<[string, Buffer]> = [
      [TELEMETRY_CMDS.getNewFlag, buildGetNewFlag(uin)],
      [TELEMETRY_CMDS.clientReport, buildClientReport(uin)],
      [TELEMETRY_CMDS.psKey, buildPsKey()],
    ]
    for (const [cmd, body] of jobs) {
      if (this.session?.uin !== String(uin) || !this.isConnected) break
      try {
        await this.sendCommand(cmd, body)
      } catch (e) {
        logger.debug(`[telemetry] ${cmd} failed: ${(e as Error).message}`)
      }
    }
  }

  /**
   * 真机 3.2.28: 新建 SSO 连接时服务器推 ConfigPushSvc.PushReq(type=1 服务器列表), 客户端必回
   * ConfigPushSvc.PushResp 回显 {type,seq}(抓真机出站包, body/reserve 逐字节复刻, 2026-10-06)。
   * Bot 原来静默丢弃 = 行为指纹偏差。fire-and-forget: PushResp 是应答, server 不再回, 不登记
   * pending(免 15s 超时噪声)。linux only(reserve 仅 linux 验证), 其它端维持旧静默不回归。
   */
  private respondConfigPush(payload: Buffer): void {
    if (getActiveProfile().name !== 'linux' || !this.session || !this.isConnected) return
    try {
      const req = parseConfigPushReq(payload)
      if (!req) return
      const seq = this.nextSeq()
      const ctx = this.getPacketContext()
      const body = buildConfigPushResp(req.type, req.seq)
      this.conn.send(buildServicePacket(seq, CONFIG_PUSH_RESP, ctx, body, EncryptType.EncryptD2Key, null))
      logger.debug(`[ConfigPush] PushResp sent (type=${req.type} seq=${req.seq})`)
    } catch (e) {
      logger.debug(`[ConfigPush] respond failed: ${(e as Error).message}`)
    }
  }

  // 诊断用: 每 50ms 一跳, 记录实际间隔超出 50ms 的部分 = 主线程被同步阻塞的时长.
  // native signRequest 若是同步阻塞调用, 会在这里体现, 且会推迟响应帧回调 (灌进 wire/netRTT).
  // 只在 --debug 下开: 常驻 50ms setInterval 在生产会白费 CPU.
  private startLoopLagMonitor(): void {
    if (this.loopLagTimer || !isDebugEnabled()) return
    const EXPECT = 50
    this.lastLoopTick = Date.now()
    this.loopLagTimer = setInterval(() => {
      const now = Date.now()
      const lag = now - this.lastLoopTick - EXPECT
      if (lag > this.maxLoopLag) this.maxLoopLag = lag
      this.lastLoopTick = now
    }, EXPECT)
    this.loopLagTimer.unref?.()
  }

  private takeMaxLoopLag(): number {
    const v = this.maxLoopLag
    this.maxLoopLag = 0
    return v
  }


  async sendHeartbeat(): Promise<void> {
    if (!isCmdAllowed('Heartbeat.Alive')) return
    const seq = this.nextSeq()
    const ctx = this.getPacketContext()
    const payload = Buffer.alloc(4)
    payload.writeUInt32BE(0x00000004)
    const packet = buildServicePacket13(seq, 'Heartbeat.Alive', ctx, payload, EncryptType.NoEncrypt)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPackets.delete(seq)
        resolve() // Don't fail on heartbeat timeout
      }, 5000)

      this.pendingPackets.set(seq, {
        resolve: () => { clearTimeout(timer); resolve() },
        reject: (err) => { clearTimeout(timer); reject(err) },
        timeout: timer,
      })

      this.conn.send(packet)
    })
  }

  disconnect(): void {
    this.stopHeartbeatAlive()
    this.stopTelemetry()
    this.conn.disconnect()
    for (const [, pending] of this.pendingPackets) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Disconnected'))
    }
    this.pendingPackets.clear()
  }

  private nextSeq(): number {
    return this.seq++
  }

  private getPacketContext(): PacketContext {
    return {
      uin: this.session?.uin || '0',
      uid: this.session?.uid || '',
      d2: this.session?.d2 || Buffer.alloc(0),
      d2Key: this.session?.d2Key || Buffer.alloc(16),
      tgt: this.session?.tgt || Buffer.alloc(0),
      guid: this.guid,
      appId: this.config.appId,
      subAppId: this.config.subAppId,
      buildVer: this.config.buildVer,
    }
  }

  async sendCommand(cmd: string, payload: Buffer, encryptType?: EncryptType, timeout = 15000, skipSign = false, signTokenOverride?: string): Promise<SsoPacket> {
    if (this.unsupportedCmds.has(cmd)) throw new CmdNotPermittedError(cmd)
    if (!isCmdAllowed(cmd)) throw new CmdBlockedError(cmd)
    const seq = this.nextSeq()
    const session = this.session
    const ctx = this.getPacketContext()
    const enc = encryptType ?? (this.session ? EncryptType.EncryptD2Key : EncryptType.EncryptEmpty)

    const t0 = Date.now()
    let tTokenDone = t0
    let tSignDone = t0

    // watch trans_emp 必须不签名 (签了服务器拒扫码授权); 桌面 trans_emp 照常签。skipSign 由调用方按协议传。
    let signResult: SignResult | null = null
    if (!skipSign && this.config.authToken && cmdNeedsSign(cmd, getActiveProfile().name)) {
      // uin 优先 session (登录成功后), 未登录时 fallback 到构造时传的 config.uin.
      // 快速登录场景 session 解不开时 session 为 null, 但 config.uin 已从明文元数据 / -q 拿到,
      // 缺了它 sign 服务器会 400 'missing uin' 直接拒
      const uin = this.session?.uin ? Number(this.session.uin) : (this.config.uin || undefined)
      await this.ensureSignTokenFresh(uin)
      tTokenDone = Date.now()
      // [SA 1001 修复] signTokenOverride (SA=token1) 优先于 session token: SA 命令必须用 token1
      // 签 (真机 SecInfo sf2=token1), 而此刻 session.signToken12B 还空 (正在取 token)。
      const protocolToken = signTokenOverride ?? this.protocolTokenFor(cmd)
      signResult = await requestSign(cmd, payload, seq, this.guid, AppInfo.qua, uin, protocolToken)
      tSignDone = Date.now()
      if (signResult?.token.length === 0) {
        signResult.token = Buffer.from(protocolToken ?? '')
      }
      logger.debug(`[sign] ${cmd} seq=${seq}: result=${signResult ? `sign=${signResult.sign.length}B token=${signResult.token.length}B extra=${signResult.extra.length}B` : 'null'}`)
      // sign 是协议必需字段, 拿不到就别送 unsigned 包出去. requestSign 内部已经按 status
      // 打过具体错因 (401/403/502/503), 这里只丢异常中断 cmd.
      if (!signResult) {
        throw new Error(`sign failed for ${cmd}; see [Sign] log above`)
      }
    }

    // Signing can still be in flight when another request invalidates the session.
    if (this.session !== session) {
      throw new Error('QQ session changed before the command could be sent')
    }
    const packet = buildServicePacket(seq, cmd, ctx, payload, enc, signResult)

    const tSendStart = Date.now()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPackets.delete(seq)
        reject(new Error(`Command ${cmd} timed out after ${timeout}ms`))
      }, timeout)

      const finish = (fn: (v: any) => void) => (v: any) => {
        if (isDebugEnabled()) {
          const tDone = Date.now()
          const arrive = this.frameArriveAt.get(seq)
          this.frameArriveAt.delete(seq)
          const wire = arrive ? arrive - tSendStart : -1   // send -> 字节到达 socket (网络+服务端+event-loop 投递)
          const parse = arrive ? tDone - arrive : -1        // 字节到达 -> resolve (解密/解析, 纯本地)
          logger.debug(
            `[timing] ${cmd} seq=${seq}: token=${tTokenDone - t0}ms sign=${tSignDone - tTokenDone}ms wire=${wire}ms parse=${parse}ms netRTT=${tDone - tSendStart}ms maxLoopLag=${this.takeMaxLoopLag()}ms total=${tDone - t0}ms`
          )
        }
        fn(v)
      }

      this.pendingPackets.set(seq, { resolve: finish(resolve), reject: finish(reject), timeout: timer })
      this.conn.send(packet)
    })
  }

  private handlePacket(frame: Buffer): void {
    const tArrive = Date.now()
    const d2Key = this.session?.d2Key || Buffer.alloc(16)
    const parsed = parseServicePacket(frame, d2Key)
    if (!parsed) {
      this.emit('error', new Error('Failed to parse incoming packet'))
      return
    }
    // Authentication failures can have seq=0 and no command, so handle them before request matching.
    if (parsed.retCode === -10001 && this.session) {
      const uin = this.session.uin
      const error = new Error(
        `QQ session authentication failed: retCode=${parsed.retCode}, ${parsed.extraMsg || 'Please log in again'}`,
      )
      this.clearSession()
      for (const pending of this.pendingPackets.values()) {
        clearTimeout(pending.timeout)
        pending.reject(error)
      }
      this.pendingPackets.clear()
      this.frameArriveAt.clear()
      this.emit('session-expired', uin, error)
      return
    }
    if (isDebugEnabled()) this.frameArriveAt.set(parsed.seq, tArrive)
    const pending = this.pendingPackets.get(parsed.seq)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingPackets.delete(parsed.seq)
      if (parsed.retCode && parsed.retCode !== 0) {
        pending.reject(this.toCommandError(parsed))
      } else {
        pending.resolve(parsed)
      }
      return
    }

    // 无主错误帧不是业务推送, body 也不是有效 protobuf, 别喂给 dispatcher.
    if (parsed.retCode && parsed.retCode !== 0) {
      logger.warn(`[SSO] unmatched error frame cmd=${parsed.cmd} seq=${parsed.seq} retCode=${parsed.retCode} extraMsg=${parsed.extraMsg || ''}`)
      return
    }

    // 真机: 新建 SSO 连接时服务器推 ConfigPushSvc.PushReq, 客户端回 PushResp 回显 {type,seq}。
    if (parsed.cmd === CONFIG_PUSH_REQ) this.respondConfigPush(parsed.payload)

    this.emit('push', parsed)
  }

  /** -10122 = 当前产品线没这个 cmd 的权限, 单独成型让调用方能降级而不是当普通故障重试. */
  private toCommandError(parsed: SsoPacket): Error {
    if (parsed.retCode === CMD_NOT_PERMITTED_RET_CODE) {
      this.unsupportedCmds.add(parsed.cmd)
      logger.warn(`[Protocol] ${parsed.cmd} not permitted for ${getActiveProfile().name}, will not retry it`)
      return new CmdNotPermittedError(parsed.cmd, parsed.extraMsg || '')
    }
    return new Error(`SSO ${parsed.cmd} failed: retCode=${parsed.retCode}, extraMsg=${parsed.extraMsg || ''}`)
  }

  get isConnected(): boolean {
    return this.conn.isConnected
  }

  get isLoggedIn(): boolean {
    return this.session !== null
  }

  getGuid(): Buffer {
    return this.guid
  }

  setGuid(guid: Buffer): void {
    this.guid = guid
    setSignMachineGuid(guid)
  }

  /**
   * 复用同一 client 时热更新配置 (换 token / 换账号 uin). native sign 是进程单例, relay 只绑首个
   * client, 所以不能靠重建 client 换配置 -- 只能在活着的这一个上原地更新. 见 direct doInitDirectClient.
   */
  setAuthToken(token: string): void {
    this.config.authToken = token
  }

  setUin(uin?: number): void {
    this.config.uin = uin
  }

  getSession(): SessionInfo | null {
    return this.session
  }

  getEcdhPublicKey(): Buffer {
    return this.ecdhKeyPair.publicKey
  }

  getEcdhShareKey(): Buffer {
    return this.ecdhKeyPair.shareKey
  }

  setSession(session: SessionInfo): void {
    this.session = session
    recordKey('d2Key', session.d2Key, `TEA key of every EncryptD2Key SSO frame (uin ${session.uin})`)
    recordKey('d2', session.d2, 'SSO head credential, not a key')
    recordKey('tgt', session.tgt, 'SSO head credential, not a key')
    recordKey('a2Key', session.a2Key, 'from TLV 0x10D')
    this.emit('login', session)
    void this.tryAcquireSignToken()
    // SsoReport 遥测 loop 不在 setSession 起: 此刻 ESK/SA/SsoInfoSync 都没跑, 在这里起会让报告
    // (尤其大的 verify_file) 渗进握手、怼在 SA 之后 -> 跟真机不符 (真机 SA 之后全是小 enc01 帧,
    // 没有 verify_file 尺寸的帧)。改由 direct.ts 在 registerOnline 上线成功后调 startLinuxSsoReportLoop(),
    // 对齐"先 ESK->SA 拿 token、再 SsoInfoSync 上线、再开遥测"的真机时序。
  }

  async startLinuxSsoReportLoop(): Promise<void> {
    if (getActiveProfile().name !== 'linux' || !this.session || !this.config.authToken) return
    await startLinuxSsoReport({
      qua: AppInfo.qua,
      guidHex: this.guid.toString('hex'),
      uin: this.session.uin,
    })
    // xwid 登录突发: 原生 send path 连号快发, 复刻真机登录爆发。非阻塞背景执行 (预签在后台跑,
    // 完再一次性 blast), 条数 LINUX_XWID_BURST (env 可调, 默认见常量定义)。
    if (LINUX_XWID_BURST > 0) {
      const body = buildLinuxXwidBody(AppInfo.qua)
      if (body) void this.sendXwidBurst(LINUX_XWID_BURST, body)
    }
    // 稳态遥测 loop: 真机登录后每 ~316s 发 getNewFlag/ClientReport/psKey, 补 Bot 的"哑连接"缺口。
    this.startTelemetryLoop()
    // 低频 aux 遥测: 真机 ~27min 偶发的 0x102a_1/0x116d_1/0x9067_202/SsoGetConfig。
    this.startAuxTelemetryLoop()
  }

  /**
   * Linux xwid 登录突发: 复刻真机登录瞬间的 xwid 连号发 (实测 ~1ms/包、~1000/s、摊 ~2.5s; 非"微秒瞬时")。
   *   1. 批量签: 一次 NAPI (signLinuxXwidBurst) 里 Rust 循环签 count 条 (sign-core ~450k/s, 各条 ts+1ms
   *      -> sign 各异)。取代逐条 requestSign 打 count 次 JS↔NAPI 往返 —— 那才是唯一慢点, 签名本身不慢。
   *   2. 预留连续 seq 段 (JS 单线程无 await 介入 = 原子; 别的 send 拿 base+count 之后的 seq, 不插本段)。
   *   3. 组帧 + conn.send, 分块 pace 到 LINUX_XWID_BURST_RATE (默认 1000/s 对齐真机, 避免瞬发尖峰踩限流);
   *      **不登记 pendingPackets** (fire-and-forget: 服务端对 SsoReport 基本不回, 偶尔回也因无 pending 静默丢)。
   * 非阻塞: 调用方 void 触发, 批量签 + 分块 pace 全在后台跑。
   */
  async sendXwidBurst(count: number, body: Buffer): Promise<void> {
    if (count <= 0 || !body?.length) return
    const cmd = 'trpc.o3.report.Report.SsoReport'
    if (!this.isConnected || !this.session || !this.config.authToken) return
    if (!cmdNeedsSign(cmd, getActiveProfile().name)) return
    const session = this.session
    const uin = this.session.uin ? Number(this.session.uin) : (this.config.uin || undefined)
    // burst 用真 session token 签 (对齐真机: emptyToken 之后 ESK 已回, xwid 带 token1)。ensureSignTokenFresh
    // 在 acquire 仍 in-flight 时会立即放行(空 token), 故再显式等一次 in-flight 完成, 保证整批用真 token1。
    // burst 不在 acquire 的发包路径上, 不触发那个"等自己"死锁。
    await this.ensureSignTokenFresh(uin)
    if (this.signTokenRefreshInflight) { try { await this.signTokenRefreshInflight } catch { /* 取失败退化空 token */ } }
    if (this.session !== session || !this.isConnected) return

    // 1. 预留连续 seq 段 (原子)
    const base = this.seq
    this.seq = (this.seq + count) >>> 0
    const token = this.protocolTokenFor(cmd)

    // 2. 批量签 (一次 NAPI). 老 .node 无 signXwidBurst -> 返 null, 跳过突发 (不回退逐条, 免 count 次 NAPI)。
    const sigs = await signLinuxXwidBurst({
      cmd,
      bodyHex: body.toString('hex'),
      seq: base,
      guidHex: this.guid.toString('hex'),
      qua: AppInfo.qua,
      uin: uin ?? 0,
      protocolTokenHex: token ? Buffer.from(token, 'utf-8').toString('hex') : '',
    }, count)
    if (!sigs || sigs.length === 0) return
    if (this.session !== session || !this.isConnected) return

    // 3. 组帧 + 分块 pace 发送 (默认 ~1000/s 对齐真机); 不登记响应等待
    const ctx = this.getPacketContext()
    const CHUNK = 20
    const chunkDelayMs = LINUX_XWID_BURST_RATE >= 100000 ? 0 : Math.max(0, Math.round((1000 * CHUNK) / LINUX_XWID_BURST_RATE))
    let sent = 0
    for (let i = 0; i < sigs.length; i++) {
      if (this.session !== session || !this.isConnected) break // 断开/换会话 -> 停
      const seq = (base + i) >>> 0
      try {
        this.conn.send(buildServicePacket(seq, cmd, ctx, body, EncryptType.EncryptD2Key, sigs[i]))
        sent++
      } catch { break }
      if (chunkDelayMs > 0 && (i + 1) % CHUNK === 0) {
        await new Promise((r) => setTimeout(r, chunkDelayMs))
      }
    }
    logger.debug(`[xwid-burst] sent ${sent}/${count} (seq ${base}..${(base + count - 1) >>> 0}, rate~${LINUX_XWID_BURST_RATE}/s)`)
  }

  /**
   * 登录后主动拉一次 sign-token. 转给 ensureSignTokenFresh 走共享 in-flight lock,
   * 避免启动期跟首次 sendCommand 并发开两个 acquire。
   */
  private async tryAcquireSignToken(): Promise<void> {
    if (!this.session || !this.config.authToken) return
    const uin = Number(this.session.uin)
    if (!Number.isFinite(uin) || uin <= 0) return
    await this.ensureSignTokenFresh(uin)
  }

  /**
   * [SA 1001 测试 B] 阻塞等到本次登录的 o3 sign-token 获取 (ESK -> SA) 跑完。
   * setSession 已 void 触发 tryAcquireSignToken (fire-and-forget); 这里确保在 registerOnline
   * (SsoInfoSync 上线) **之前** token 链已完成 —— 对齐 QQ 真机时序 (先 ESK->SA 拿 token 再上线),
   * Bot 原来先上线再取 token, 怀疑是 SA 1001 主因。幂等 (in-flight lock) + 不抛 (失败走原回退)。
   */
  async awaitSignTokenAcquire(): Promise<void> {
    if (!this.session || !this.config.authToken) return
    const uin = Number(this.session.uin)
    if (!Number.isFinite(uin) || uin <= 0) return
    await this.ensureSignTokenFresh(uin)
    // ensureSignTokenFresh 命中 re-entrancy/in-flight guard 时会提前 return 不 await,
    // 这里显式 await setSession 先触发的那个 in-flight promise, 保证 ESK->SA 真跑完。
    const inflight = this.signTokenRefreshInflight
    if (inflight) {
      try { await inflight } catch { /* 失败按原回退, 不阻断登录 */ }
    }
  }

  /**
   * sendCommand 前调. 按服务端下发的 TTL 续期:
   *   1. 没 session / 没 uin -> noop
   *   2. 从没拉过 (expiresAt undefined) -> 首拉一次
   *   3. 有非空 token 且未过期 -> 复用不刷
   *   4. 有非空 token 但已过期 -> 重新 acquire 续期 (续期失败按 lastFetchAt 限最小重试间隔)
   *   5. 空 token (403 软降级) -> 不刷, 免得 403 情况每次发包都去重试 acquire
   * signToken12B/expiresAt 不落盘 (见 session.ts), 每次启动/恢复都从 undefined 起,
   * 故登录后 tryAcquireSignToken 必首拉一次。in-flight lock 防并发雪崩。
   */
  private async ensureSignTokenFresh(uin: number | undefined): Promise<void> {
    if (!this.session || !uin || !this.config.authToken) return
    // 有 token 且未过期 -> 复用不刷; 有 token 但已过期 -> 往下重新 acquire 续期 (TTL 生效)。
    if (this.session.signTokenExpiresAt) {
      const expired = Date.now() >= this.session.signTokenExpiresAt
      // 空 token (403 软降级) 或未过期: 不刷。前者免得 403 每次发包都重试 acquire。
      if (!this.session.signToken12B || !expired) return
      // 已过期要续: 续期失败会让 expiresAt 停在旧值, 导致每条命令都想续 -> 用 lastFetchAt 限最小
      // 重试间隔, 免得续不上时 acquire 风暴 (正常续期间隔 = TTL, 远大于此, 不受影响)。
      if (Date.now() - this.signTokenLastFetchAt < 30_000) return
    }
    // 防重入死锁 (关键, 别改回 await): acquire 一个 token 内部要发 ecdh_access 包, 那些包走
    // sendCommand 又重入到这里。inflight 已在跑就直接放行 -- 让本次发包用当前空 token sign
    // (此刻本来也没 token)。改成 await inflight 就是去等那个正等本次发包返回的 promise = 等自己,
    // 死锁: 登录后 hang, acquire 永不返回, sign token 也打印不出来。
    if (this.signTokenRefreshInflight) return
    this.signTokenRefreshInflight = (async () => {
      try {
        this.signTokenLastFetchAt = Date.now()
        // macOS: A2+SA2 need this connection's ESK channel; a renewal past its TTL re-runs ESK first.
        const esk = await this.ensureMacosEsk()
        const { token, ttlSecs } = await acquireSignToken(uin, AppInfo.qua, esk)
        if (this.session) {
          this.session.signToken12B = token
          this.session.signTokenExpiresAt = Date.now() + ttlSecs * 1000
          logger.info(`[SignToken] acquired "${token}" ttl=${ttlSecs}s`)
          recordKey('signToken12B', Buffer.from(token, 'utf-8'), `sign device token, ttl=${ttlSecs}s`)
        }
      } catch (e) {
        // 首拉失败: expiresAt 仍 undefined, 下条 allowlist 命令会再试一次首拉。
        logger.warn(`[SignToken] acquire failed: ${(e as Error).message}`)
      } finally {
        this.signTokenRefreshInflight = null
      }
    })()
    await this.signTokenRefreshInflight
  }

  clearSession(): void {
    this.session = null
    stopLinuxSsoReport()
  }
}
