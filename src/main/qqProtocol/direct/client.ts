import { TcpConnection } from './connection'
import { buildServicePacket, buildServicePacket13, parseServicePacket, EncryptType, PacketContext, SsoPacket } from './packet'
import { generateEcdhKeyPair, EcdhKeyPair } from './ecdh'
import { requestSign, preflightSign, SignResult, PreflightLogger } from './sign'
import { AppInfo } from './appInfo'
import { randomBytes, createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'

export interface DirectClientConfig {
  appId: number
  subAppId: number
  ssoVersion: number
  buildVer: string
  useIPv6?: boolean
  signUrl?: string
  /** 一次性 token, 由用户在 manager-web 生成后粘贴到 data/sign_token.txt. 跟 sign 请求一起发. */
  signToken?: string
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
  // QQ 协议层 12B ASCII sign-token (e.g. "aUIOeuqqqfxm"), 来自 ECDH/AES-GCM 三步握手.
  // 为空 = 未获取到 (Phase 1 骨架阶段是常态), 现有 sign 路径自动退回空 token.
  // 跟 DirectClientConfig.signToken (manager JWT) 完全两个东西.
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
  private pendingPackets: Map<number, {
    resolve: (packet: SsoPacket) => void
    reject: (err: Error) => void
    timeout: NodeJS.Timeout
  }> = new Map()

  constructor(config: Partial<DirectClientConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.conn = new TcpConnection()
    this.ecdhKeyPair = generateEcdhKeyPair()
    this.guid = randomBytes(16)

    this.conn.on('packet', (frame: Buffer) => this.handlePacket(frame))
    this.conn.on('error', (err) => this.emit('error', err))
    this.conn.on('close', () => this.emit('close'))
  }

  async connect(): Promise<void> {
    await this.conn.connect({ useIPv6: this.config.useIPv6 })
    this.emit('connected')

    // Send initial heartbeat (required before other commands)
    await this.sendHeartbeat()
  }

  /**
   * 调一次 sign 服务确认链路通. 启动前先跑这个, 任一环节不通直接 throw,
   * 不让 connect / login / 恢复 session 在没 sign 的情况下白跑.
   *
   * 失败抛 Error, message 里带原因 ('token unauthorized' / 'no sign backend' /
   * 'sign-service down' / network 错误). 调用方 try/catch 决定是不是 fatal.
   *
   * 前置条件: signUrl + signToken 必须已配 (caller 在 new 之前应已校验).
   */
  async preflightSign(logger: PreflightLogger, uin?: number): Promise<void> {
    if (!this.config.signUrl || !this.config.signToken) {
      throw new Error('signUrl/signToken not configured')
    }
    const err = await preflightSign(this.config.signUrl, this.config.signToken, AppInfo.qua, logger, uin)
    if (err) {
      throw new Error(`sign preflight failed: ${err}`)
    }
    logger.info('[Sign Preflight] OK (manager=%s qua=%s uin=%s)', this.config.signUrl, AppInfo.qua, uin ?? '<unset>')
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
    'trpc.login.ecdh.EcdhService.SsoKeyExchange',
    'OidbSvcTrpcTcp.0x6d9_4'
  ])

  async sendCommand(cmd: string, payload: Buffer, encryptType?: EncryptType, timeout = 15000): Promise<SsoPacket> {
    const seq = this.nextSeq()
    const ctx = this.getPacketContext()
    const enc = encryptType ?? (this.session ? EncryptType.EncryptD2Key : EncryptType.EncryptEmpty)

    let signResult: SignResult | null = null
    if (this.config.signUrl && this.SIGN_ALLOWLIST.has(cmd)) {
      // wtlogin.login 服务端从 body[9..13] 抠 uin, 不读这字段; trans_emp 还没登录没 uin.
      // 其它 cmd manager 端必须 uin in allowed_uins.
      const uin = this.session?.uin ? Number(this.session.uin) : undefined
      signResult = await requestSign(this.config.signUrl, cmd, payload, seq, this.guid, this.config.signToken, AppInfo.qua, uin, this.session?.signToken12B)
      if (process.env.DEBUG_SIGN) {
        console.log(`[Sign] ${cmd} seq=${seq}: result=${signResult ? `sign=${signResult.sign.length}B token=${signResult.token.length}B extra=${signResult.extra.length}B` : 'null'}`)
      }
      // sign 是协议必需字段, 拿不到就别送 unsigned 包出去 -- server 不一定 reject 但行为没保证.
      // requestSign 内部已经按 status 打过具体错因 (401/403/502/503), 这里只丢异常中断 cmd.
      if (!signResult) {
        throw new Error(`sign failed for ${cmd}; see [Sign] log above`)
      }
    }

    const packet = buildServicePacket(seq, cmd, ctx, payload, enc, signResult)

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
    // best-effort: 跑 ECDH 三步握手拿 12B 协议层 sign-token. 失败不阻塞登录,
    // sign 路径自动退回空 token (跟当前默认行为一致).
    void this.tryAcquireSignToken()
  }

  /**
   * 跑 sign-token 三步握手. 失败 swallow + warn, 让 login 继续.
   * Phase 1 骨架: 三个 SSO cmd 的 request PB schema 还没逆出来, 必抛
   * NotImplementedError. 等补完 schema 后会自动跑通.
   */
  private async tryAcquireSignToken(): Promise<void> {
    if (!this.session || !this.config.signUrl || !this.config.signToken) return
    const uin = Number(this.session.uin)
    if (!Number.isFinite(uin) || uin <= 0) return

    try {
      const { acquireSignToken } = await import('./signTokenAcquire')
      const { token, expiresAt } = await acquireSignToken(
        this,
        this.config.signUrl,
        this.config.signToken,
        uin,
      )
      if (this.session) {
        this.session.signToken12B = token
        this.session.signTokenExpiresAt = expiresAt
      }
      console.log(`[SignToken] acquired 12B token (expires ${new Date(expiresAt * 1000).toISOString()})`)
    } catch (e) {
      const msg = (e as Error).message
      // NotImplementedError 是 Phase 1 预期路径, debug 打印就够; 其他错误正经 warn.
      if ((e as Error).name === 'NotImplementedError') {
        console.log(`[SignToken] skipped (${msg}); sign 用空 token 继续`)
      } else {
        console.warn(`[SignToken] acquire failed: ${msg}; sign 用空 token 继续`)
      }
    }
  }

  clearSession(): void {
    this.session = null
  }
}
