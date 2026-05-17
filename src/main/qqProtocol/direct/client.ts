/**
 * Direct QQ Protocol Client
 * Manages connection, login, and packet exchange with QQ servers
 */

import { TcpConnection } from './connection'
import { buildServicePacket, parseServicePacket, EncryptType, PacketContext, SsoPacket } from './packet'
import { generateEcdhKeyPair, EcdhKeyPair } from './ecdh'
import { randomBytes, createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'

export interface DirectClientConfig {
  appId: number
  subAppId: number
  ssoVersion: number
  buildVer: string
  useIPv6?: boolean
}

// Linux PC platform defaults
const DEFAULT_CONFIG: DirectClientConfig = {
  appId: 1600001615,
  subAppId: 537234773,
  ssoVersion: 19,
  buildVer: '6.9.63-25765',
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
}

export class DirectProtocolClient extends EventEmitter {
  private conn: TcpConnection
  private config: DirectClientConfig
  private ecdhKeyPair: EcdhKeyPair
  private guid: Buffer
  private seq = 0x1000
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
      d2: this.session?.d2 || Buffer.alloc(0),
      d2Key: this.session?.d2Key || Buffer.alloc(16),
      tgt: this.session?.tgt || Buffer.alloc(0),
      guid: this.guid,
      appId: this.config.appId,
      subAppId: this.config.subAppId,
      ssoVersion: this.config.ssoVersion,
      buildVer: this.config.buildVer,
    }
  }

  /**
   * Send a command and wait for response
   */
  async sendCommand(cmd: string, payload: Buffer, encryptType?: EncryptType, timeout = 15000): Promise<SsoPacket> {
    const seq = this.nextSeq()
    const ctx = this.getPacketContext()
    const enc = encryptType ?? (this.session ? EncryptType.EncryptD2Key : EncryptType.EncryptEmpty)
    const packet = buildServicePacket(seq, cmd, ctx, payload, enc)

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

    // Check for pending request
    const pending = this.pendingPackets.get(parsed.seq)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingPackets.delete(parsed.seq)
      pending.resolve(parsed)
      return
    }

    // Server push event
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

  getEcdhPublicKey(): Buffer {
    return this.ecdhKeyPair.publicKey
  }

  getEcdhShareKey(): Buffer {
    return this.ecdhKeyPair.shareKey
  }

  setSession(session: SessionInfo): void {
    this.session = session
    this.emit('login', session)
  }
}
