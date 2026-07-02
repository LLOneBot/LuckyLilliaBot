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
      if (signResult?.token.length === 0) {
        signResult.token = Buffer.from(this.session?.signToken12B ?? '')
      }
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
   * sendCommand 前调. 刷新机制暂时禁用 -> 只首拉一次, 拉到后整个进程生命周期不再刷:
   *   1. 没 session / 没 uin -> noop
   *   2. 从没拉过 (expiresAt undefined) -> 拉一次
   *   3. 已拉到过 (有 expiresAt, 含 403 软降级的空 token) -> 不刷
   * signToken12B/expiresAt 不落盘 (见 session.ts), 每次启动/恢复都从 undefined 起,
   * 故登录后 tryAcquireSignToken 必首拉一次。in-flight lock 防并发雪崩。
   * 代价: 12B token 服务端有 TTL, 过期后本地不续 -> sign 失败, 需重启 bot 重新登录。
   */
  private async ensureSignTokenFresh(uin: number | undefined): Promise<void> {
    if (!this.session || !uin || !this.config.authToken) return
    // 暂时禁用刷新: 不看 TTL/时间, 拉到过 (有 expiresAt, 含 403 软降级的空 token) 就不再刷。
    if (this.session.signTokenExpiresAt) return
    // 防重入死锁 (关键, 别改回 await): acquire 一个 token 内部要发 ecdh_access 包, 那些包走
    // sendCommand 又重入到这里。inflight 已在跑就直接放行 -- 让本次发包用当前空 token sign
    // (此刻本来也没 token)。改成 await inflight 就是去等那个正等本次发包返回的 promise = 等自己,
    // 死锁: 登录后 hang, acquire 永不返回, sign token 也打印不出来。
    if (this.signTokenRefreshInflight) return
    this.signTokenRefreshInflight = (async () => {
      try {
        this.signTokenLastFetchAt = Date.now()
        const { token, ttlSecs } = await acquireSignToken(uin, AppInfo.qua)
        if (this.session) {
          // ttl 只用来填 expiresAt 当"已拉到过"的标记 (拿不到回退 20min); 不再触发刷新, 上面
          // early return 不看时间。token 空 (403 软降级) 也照设标记, 不重拉。
          const ttlMs = ttlSecs > 0 ? ttlSecs * 1000 : 20 * 60 * 1000
          this.session.signToken12B = token
          this.session.signTokenExpiresAt = Date.now() + ttlMs
          console.log(`[SignToken] acquired "${token}" ttl=${ttlSecs > 0 ? ttlSecs + 's' : 'default'}`)
        }
      } catch (e) {
        // 首拉失败: expiresAt 仍 undefined, 下条 allowlist 命令会再试一次首拉。
        console.warn(`[SignToken] acquire failed: ${(e as Error).message}`)
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
