import { deepConvertMap } from './util'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { BridgeStatus, NativeQQRes, NativeQQResSendPB, NativeQQHealth, PBData, QQResourceUsage, ResListener } from './types'
import { Context } from 'cordis'
import { currentNativeQQTarget, getCdn, getSpecifiedUin, isDockerEnvironment } from '@/common/utils/environment'
import { getNativeAddon, type NativeQQ } from '@/native'
import { authTokenUtil } from '@/main/config'
import { AuthTokenWatcher } from './direct-lib/authTokenWatcher'
import { QQProtocolBase, type QuickLoginAccounts } from './base'
import { detectQQPath } from '../qqPath'

/**
 * The protocol owns one NativeQQ, its sessions (one at a time, started by launch()), each session's token watcher
 * and polling timer. What the bridge is doing is NativeQQ's to say: health() has the session's phase, QQ's process
 * and the account.
 */
export class NativeQQProtocol extends QQProtocolBase {
  private native?: NativeQQ
  private config: Record<string, unknown> = {}
  private configuredToken = ''
  private launching?: Promise<void>
  private watcher?: AuthTokenWatcher
  private probeTimer?: NodeJS.Timeout
  private connected = false
  private generation = 0
  private resListeners = new Map<string, ResListener<any>>()

  constructor(ctx: Context) { super(ctx) }

  protected async start(): Promise<void> {
    const addon = getNativeAddon()
    this.config = this.nativeConfig()
    this.native = new addon.NativeQQ()
    // QQ starts by itself only where nobody is at the NTQQ page to press the button: an account given at launch,
    // or docker
    if (this.config.quick_login_qq === undefined && !isDockerEnvironment()) return
    try {
      await this.launch()
    } catch (error) {
      await this.stop().catch(() => {})
      throw error
    }
  }

  private nativeConfig(): Record<string, unknown> {
    const target = currentNativeQQTarget()
    let config: Record<string, unknown> = {}
    if (target.configPath) {
      if (!path.isAbsolute(target.configPath)) throw new Error('NativeQQ 配置文件必须使用绝对路径')
      config = JSON.parse(readFileSync(target.configPath, 'utf8'))
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('NativeQQ 配置必须是 JSON 对象')
    }
    if (target.qqPath) {
      if (!path.isAbsolute(target.qqPath)) throw new Error('QQ 路径必须使用绝对路径')
      config.qq_path = target.qqPath
    }
    const requestedUin = getSpecifiedUin()
    if (requestedUin !== undefined) {
      if (!/^[1-9][0-9]*$/.test(requestedUin)) throw new Error('快速登录 QQ 号必须是正整数')
      config.quick_login_qq = requestedUin
    }
    // The Bot hosts the session itself: sub_cmd would start another Bot as a child process
    delete config.sub_cmd
    this.configuredToken = typeof config.auth_token === 'string' ? config.auth_token : ''
    config.auth_token = ''
    config.cdn ||= getCdn()
    return config
  }

  /**
   * Starts a native session, which starts QQ and injects it: the NTQQ page's button, or start() where nobody would
   * press it. Again after a session stopped or failed; a second call while one starts waits for it.
   */
  public launch(): Promise<void> {
    const native = this.native
    if (!native || this.disposed) return Promise.reject(new Error('NTQQ 协议没有在运行'))
    if (this.connected) return Promise.resolve()
    return this.launching ??= this.startSession(native).finally(() => { this.launching = undefined })
  }

  /**
   * The QQ a session would start, picked as NativeQQ picks it (a relative qq_path is from its own directory), so
   * that a missing one fails with what to do in the WebUI rather than NativeQQ's "set config.qq_path".
   */
  private async qqToStart(): Promise<string> {
    const configured = typeof this.config.qq_path === 'string' ? this.config.qq_path.trim() : ''
    if (configured) {
      const file = path.resolve(getNativeAddon().getNativeDirectory(), configured)
      if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`找不到 QQ：${file} 不存在，请在「登录方式」里重新选择 QQ 的可执行文件`)
      }
      return file
    }
    const detected = await detectQQPath()
    if (!detected) throw new Error('这台机器上没找到官方 QQ 客户端：请先安装 QQ，或在「登录方式」里选择 QQ 的可执行文件')
    return detected
  }

  private async startSession(native: NativeQQ): Promise<void> {
    await this.qqToStart()
    this.endSession()
    const generation = ++this.generation
    try {
      await native.start({ moduleDir: getNativeAddon().getNativeDirectory(), config: structuredClone(this.config), subCmdArgs: [] },
        event => this.onNativeEvent(event, generation))
    } catch (error) {
      await native.stop().catch(() => {})
      throw error
    }
    if (this.disposed) { await native.stop(); return }
    this.connected = true
    this.lastConnectedTime = Date.now()
    this.authTokenStatus.loginError = ''
    this.watcher = new AuthTokenWatcher(this.authTokenStatus, async token => {
      try { await native.setAuthToken(token) }
      catch (error) {
        if (this.disposed) return
        this.authTokenStatus.validation = 'error'
        this.authTokenStatus.message = (error as Error).message
        throw error
      }
    }, this.logger, () => this.selfInfo.online,
    () => authTokenUtil.reload() || (process.env.AUTH_TOKEN || '').trim() || this.configuredToken)
    this.watcher.start()
    void this.probe(generation)
  }

  /** What a session leaves behind once it stopped or failed: its token watcher and its poll */
  private endSession(): void {
    this.connected = false
    this.watcher?.stop()
    this.watcher = undefined
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.probeTimer = undefined
  }

  public async bridgeStatus(): Promise<BridgeStatus> {
    const health = (this.native ? await this.native.health() : {}) as NativeQQHealth
    return {
      session: health.sessionStatus || 'stopped',
      ...health.failure ? { failure: health.failure } : {},
      authTokenSet: !!health.auth_token_set,
      qqRunning: health.qq_pid != null,
      loggedIn: Number(health.uin) > 0 && typeof health.uid === 'string' && !!health.uid.trim(),
      qrcodeAvailable: !!health.qrcode_available,
    }
  }

  protected async stop(): Promise<void> {
    this.generation++
    this.endSession()
    this.resListeners.clear()
    await super.stop()
    await this.native?.stop()
  }

  public checkAuthToken(): void { this.watcher?.check() }

  /** The saved accounts the injected QQ can log in now; a native build without getQuickLoginList lists none */
  public async listQuickLoginAccounts(): Promise<QuickLoginAccounts> {
    const native = this.native as (NativeQQ & { getQuickLoginList?(timeoutMs?: number): Promise<any> }) | undefined
    if (!native?.getQuickLoginList) return { ready: true, accounts: [] }
    if (!this.get_is_connected()) return { ready: false, accounts: [] }
    // code -1: QQ not up yet, or no Auth Token; 1: logged in already
    const res = await native.getQuickLoginList()
    if (res?.code !== 0) return { ready: res?.code === 1, accounts: [] }
    const accounts = (Array.isArray(res.data) ? res.data : []).flatMap((item: any) => {
      const uin = String(item?.uin ?? '')
      if (!/^[1-9][0-9]*$/.test(uin)) return []
      return [{ uin, uid: String(item.uid ?? ''), nick: String(item.nickName ?? uin), faceUrl: item.faceUrl || undefined }]
    })
    return { ready: true, accounts }
  }

  public async quickLogin(_uin: string): Promise<void> {
    // The injected QQ quick-logs in only the account it was started with (quick_login_qq / -q)
    throw new Error('官方 QQ 客户端桥接还不能在这里快速登录（原生模块没有提供快速登录接口），请扫码登录')
  }
  public get_is_connected(): boolean { return this.connected && !this.disposed }

  private onNativeEvent(event: any, generation: number): void {
    if (this.disposed || generation !== this.generation) return
    if (event.type === 'error') {
      this.authTokenStatus.loginError = event.message || 'NativeQQ 会话失败'
      this.logger.error(this.authTokenStatus.loginError)
      this.disconnect()
      this.endSession()
      return
    }
    if (event.type === 'status' && event.data?.status === 'stopped') { this.disconnect(); this.endSession(); return }
    if (event.type === 'lagged') { this.logger.warn('NativeQQ 事件消费过慢，丢失 %s 个事件', event.data?.dropped); return }
    if (event.type !== 'send' && event.type !== 'recv') return
    const data = deepConvertMap(event) as NativeQQRes
    if (data.type === 'recv' && data.data?.cmd && data.data?.pb) {
      // Debugger captures may contain the MSF length header; protocol decoders expect bare PB.
      // Match NativeQQ.send() normalization so callbacks and direct replies use the same format.
      let payload = Buffer.from(data.data.pb, 'hex')
      if (payload.length >= 4) {
        const size = payload.readUInt32BE(0)
        if (size === payload.length || size === payload.length - 4) payload = payload.subarray(4)
      }
      data.data.pb = payload.toString('hex')
      void this.ctx.parallel('qq/raw', { cmd: data.data.cmd, payload }).catch(error => this.logger.error('NativeQQ raw listener failed', error))
    }
    for (const listener of this.resListeners.values()) {
      try { listener(data) } catch (error) { this.logger.error('NativeQQ listener failed', error) }
    }
  }

  private disconnect(): void {
    const wasOnline = this.selfInfo.online
    this.connected = false
    this.selfInfo.online = false
    this.onlineEmitted = false
    this.resetQrState()
    if (wasOnline && !this.disposed) void this.ctx.parallel('protocol/disconnect')
  }

  private async probe(generation: number): Promise<void> {
    if (this.disposed || generation !== this.generation) return
    try {
      const health = await this.native!.health()
      if (this.disposed || generation !== this.generation) return
      if (health.failure || ['stopped', 'failed'].includes(health.sessionStatus)) {
        this.authTokenStatus.loginError = health.failure || 'NativeQQ 会话已结束'
        this.disconnect()
        this.endSession()
        return
      }
      if (Number(health.uin) > 0 && typeof health.uid === 'string' && health.uid.trim()) {
        const newlyOnline = !this.selfInfo.online
        this.selfInfo.uid = health.uid
        this.selfInfo.uin = String(health.uin)
        this.selfInfo.online = true
        this.maybeEmitOnline()
        if (newlyOnline) this.scheduleFetchSelfNick(() => !this.disposed && generation === this.generation)
      } else {
        if (this.selfInfo.online) { this.disconnect(); this.connected = true }
        if (health.auth_token_set) this.ensureQrLoop()
      }
    } catch (error) { if (!this.disposed) this.logger.debug('NativeQQ health failed: %s', (error as Error).message) }
    if (!this.disposed && generation === this.generation) this.probeTimer = setTimeout(() => void this.probe(generation), 1000)
  }

  public async sendPB(cmd: string, pb: Buffer | string, timeout = 15000): Promise<PBData> {
    if (!this.get_is_connected() || !this.native) throw new Error('NativeQQ 协议未运行')
    let timer: NodeJS.Timeout | undefined
    try {
      const res = await Promise.race([
        this.native.send(cmd, pb, randomUUID()) as Promise<NativeQQResSendPB>,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('NativeQQ send timeout')), timeout) }),
      ])
      if (res.code != null && res.code !== 0) throw new Error('NativeQQ send failed: ' + cmd + ' code=' + res.code + ' ' + (res.message || ''))
      if (!res.data) throw new Error('NativeQQ send returned no payload')
      // Direct replies are consumed here; broadcasting would duplicate protocol delivery.
      return deepConvertMap(res.data)
    } finally { if (timer) clearTimeout(timer) }
  }

  protected async fetchFreshQrCode() {
    if (!this.get_is_connected()) return null
    const res = await this.native!.getLoginQrcode()
    return res.code === 0 && res.data ? {
      qrcodeUrl: res.data.qrcodeUrl, pngBase64: res.data.pngBase64QrcodeData,
      expireTimeSec: res.data.expireTime, sig: res.data.qrcodeUrl,
    } : null
  }

  public async getQQResourceUsage(): Promise<QQResourceUsage | null> {
    if (!this.get_is_connected()) return null
    try {
      const { memory, cpu, qq_full_version } = await this.native!.health() as NativeQQHealth
      if (!memory || !cpu) return null
      return { memory: memory.qq_using, totalMemory: memory.total,
        memoryPercent: memory.total > 0 ? memory.qq_using / memory.total * 100 : 0,
        cpu: Math.min(100, Math.max(0, cpu.qq_using / (cpu.total || 1) * 100)), version: qq_full_version || undefined }
    } catch { return null }
  }

  public addResListener<R extends NativeQQRes>(listener: ResListener<R>): string {
    const id = randomUUID(); this.resListeners.set(id, listener); return id
  }
  public removeResListener(id: string): void { this.resListeners.delete(id) }
  public async waitConnected(): Promise<boolean> {
    if (!this.get_is_connected()) throw new Error('NativeQQ 协议未运行')
    return true
  }
}
