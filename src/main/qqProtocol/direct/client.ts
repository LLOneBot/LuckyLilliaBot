import { TcpConnection } from './connection'
import { buildServicePacket, buildServicePacket13, parseServicePacket, EncryptType, PacketContext, SsoPacket } from './packet'
import { generateEcdhKeyPair, EcdhKeyPair } from './ecdh'
import { requestSign, setupSign, setSignMachineGuid, preflightSign, acquireSignToken, SignResult } from './sign'
import { AppInfo } from './appInfo'
import { loadMachineGuidSync } from './machineGuid'
import { EventEmitter } from 'node:events'

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
  private signPreflighted = false
  private signSetupDone = false
  private pendingPackets: Map<number, {
    resolve: (packet: SsoPacket) => void
    reject: (err: Error) => void
    timeout: NodeJS.Timeout
  }> = new Map()
  private signTokenRefreshInflight: Promise<void> | null = null
  private signTokenLastFetchAt = 0

  constructor(config: Partial<DirectClientConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.guid = loadMachineGuidSync()
    // sign 初始化不在构造函数里做 -- native init 现在是 async (传 uin 时 await /api/bu bind),
    // 构造函数没法 await. 挪到 connect() 顶部, 由调用方 await. 见 ensureSignSetup.
    this.conn = new TcpConnection()
    this.ecdhKeyPair = generateEcdhKeyPair()

    this.conn.on('packet', (frame: Buffer) => this.handlePacket(frame))
    this.conn.on('error', (err) => this.emit('error', err))
    this.conn.on('close', () => this.emit('close'))
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
      sendPacket: async ({ cmd, body }) => {
        const resp = (await this.sendCommand(cmd, Buffer.from(body))).payload
        if (process.env.DEBUG_SIGN) {
          console.log(`[Sign relay] ${cmd}: req=${body.length}B resp=${resp.length}B hex=${resp.toString('hex')}`)
        }
        return resp
      },
    })
  }

  async connect(): Promise<void> {
    // 必须在 preflight 之前: preflight 依赖 native Client 已 init.
    await this.ensureSignSetup()
    if (!this.signPreflighted && this.config.authToken) {
      this.signPreflighted = true
      const reason = await preflightSign()
      if (reason) throw new Error(`sign preflight failed: ${reason}`)
    }
    await this.conn.connect({ useIPv6: this.config.useIPv6 })
    this.emit('connected')

    // Send initial heartbeat (required before other commands)
    await this.sendHeartbeat()
  }


  async sendHeartbeat(): Promise<void> {
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

  private readonly SIGN_ALLOWLIST = new Set([
    'wtlogin.trans_emp',
    'wtlogin.login',
    'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey',
    'trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess',
    'MessageSvc.PbSendMsg',
    'OidbSvcTrpcTcp.0x6d9_4'
  ])

  async sendCommand(cmd: string, payload: Buffer, encryptType?: EncryptType, timeout = 15000): Promise<SsoPacket> {
    const seq = this.nextSeq()
    const ctx = this.getPacketContext()
    const enc = encryptType ?? (this.session ? EncryptType.EncryptD2Key : EncryptType.EncryptEmpty)

    let signResult: SignResult | null = null
    if (this.config.authToken && this.SIGN_ALLOWLIST.has(cmd)) {
      const uin = this.session?.uin ? Number(this.session.uin) : undefined
      await this.ensureSignTokenFresh(uin)
      signResult = await requestSign(cmd, payload, seq, this.guid, AppInfo.qua, uin, this.session?.signToken12B)
      if (process.env.DEBUG_SIGN) {
        console.log(`[Sign] ${cmd} seq=${seq}: result=${signResult ? `sign=${signResult.sign.length}B token=${signResult.token.length}B extra=${signResult.extra.length}B` : 'null'}`)
      }
      // sign 是协议必需字段, 拿不到就别送 unsigned 包出去. requestSign 内部已经按 status
      // 打过具体错因 (401/403/502/503), 这里只丢异常中断 cmd.
      if (!signResult) {
        throw new Error(`sign failed for ${cmd}; see [Sign] log above`)
      }
    }

    const packet = buildServicePacket(seq, cmd, ctx, payload, enc, signResult)

    if (process.env.DEBUG_SIGN) {
      // 调试用: 出网前 dump SSO frame, 跟真机抓包对照定位 sign 不一致的字节差异.
      if (cmd.includes('o3.ecdh_access') || cmd === 'wtlogin.login' || cmd === 'wtlogin.trans_emp') {
        console.log(`[Bot SSO send] ${cmd} seq=${seq} frame=${packet.length}B hex=${packet.toString('hex')}`)
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPackets.delete(seq)
        reject(new Error(`Command ${cmd} timed out after ${timeout}ms`))
      }, timeout)

      this.pendingPackets.set(seq, { resolve, reject, timeout: timer })
      this.conn.send(packet)
    })
  }

  private handlePacket(frame: Buffer): void {
    const d2Key = this.session?.d2Key || Buffer.alloc(16)
    const parsed = parseServicePacket(frame, d2Key)
    if (!parsed) {
      this.emit('error', new Error('Failed to parse incoming packet'))
      return
    }

    const pending = this.pendingPackets.get(parsed.seq)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingPackets.delete(parsed.seq)
      if (parsed.retCode && parsed.retCode !== 0) {
        pending.reject(new Error(`SSO ${parsed.cmd} failed: retCode=${parsed.retCode}, extraMsg=${parsed.extraMsg || ''}`))
      } else {
        pending.resolve(parsed)
      }
      return
    }

    this.emit('push', parsed)
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
    this.emit('login', session)
    void this.tryAcquireSignToken()
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
   * sendCommand 前调. 触发场景:
   *   1. 有 expiresAt 且临期 (60s 内) / 过期 -> 重拉
   *   2. 从来没拉过 (expiresAt 是 undefined) 且距离上次尝试 > 60s -> 重试
   *   3. 没 session 或没 uin -> noop
   * 注: token 可能是空字符串 (manager 403 软降级 / uin 不在白名单), 这时
   * server 仍下发 TTL, 我们尊重它 -- 30min 内反复重试也是空, 没意义.
   * in-flight lock 防并发雪崩, lastFetchAt 兜底防 expiresAt 永远拿不到时的死循环.
   */
  private async ensureSignTokenFresh(uin: number | undefined): Promise<void> {
    if (!this.session || !uin || !this.config.authToken) return
    const expiresAt = this.session.signTokenExpiresAt
    const needRefresh = expiresAt
      ? expiresAt - Date.now() <= 60_000
      : (Date.now() - this.signTokenLastFetchAt > 60_000)
    if (!needRefresh) return

    if (this.signTokenRefreshInflight) {
      await this.signTokenRefreshInflight
      return
    }
    this.signTokenRefreshInflight = (async () => {
      try {
        this.signTokenLastFetchAt = Date.now()
        const { token, ttlSecs } = await acquireSignToken(uin, AppInfo.qua)
        if (this.session) {
          // 用 QQ 下发的真实 TTL (ESK field 3); 拿不到 (0) 回退 20min 保守值.
          // token 空也尊重 TTL -- 空是 server 业务态 (没权 / 没绑), 30min 内再问也是空.
          const ttlMs = ttlSecs > 0 ? ttlSecs * 1000 : 20 * 60 * 1000
          this.session.signToken12B = token
          this.session.signTokenExpiresAt = Date.now() + ttlMs
          console.log(`[SignToken] lazy refresh "${token}" ttl=${ttlSecs > 0 ? ttlSecs + 's' : 'default'}`)
        }
      } catch (e) {
        if (this.session && expiresAt && expiresAt < Date.now()) {
          this.session.signToken12B = undefined
          this.session.signTokenExpiresAt = undefined
          console.warn(`[SignToken] refresh failed (${(e as Error).message}), 清掉过期 token`)
        } else {
          console.warn(`[SignToken] refresh failed: ${(e as Error).message}`)
        }
      } finally {
        this.signTokenRefreshInflight = null
      }
    })()
    await this.signTokenRefreshInflight
  }

  clearSession(): void {
    this.session = null
  }
}
