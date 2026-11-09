import { deepConvertMap } from './util'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { BridgeStatus, NativeQQRes, NativeQQResSendPB, NativeQQHealth, PBData, QQResourceUsage, ResListener } from './types'
import { currentNativeQQTarget, getCdn, getSpecifiedUin, isDockerEnvironment } from '@/common/utils/environment'
import { getNativeAddon, type NativeQQ } from '@/native'
import { authTokenUtil } from '@/main/config'
import { AuthTokenWatcher } from './direct-lib/authTokenWatcher'
import { QQProtocolBase, QuickLoginUnsupportedError, type QuickLoginAccounts } from './base'
import { detectQQPath } from '../qqPath'

const QUICK_LOGIN_UNSUPPORTED = '当前原生模块不支持桥接快速登录，请更新 LLBot 原生包后重启；暂时可扫码登录'

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
  private quickLoginPending?: { uin: string; generation: number; promise: Promise<void> }
  private resListeners = new Map<string, ResListener<any>>()

  protected async start(): Promise<void> {
    const addon = getNativeAddon()
    this.config = this.nativeConfig()
    this.native = new addon.NativeQQ()
    // Start QQ for an account given at launch or remembered by this instance, and in docker.
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
    } else if (config.quick_login_qq === undefined && this.loginOptions.autoLoginUin) {
      // An explicit launch configuration takes precedence over the instance's preference.
      config.quick_login_qq = this.loginOptions.autoLoginUin
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
    const generation = this.generation
    try {
      await native.start({ moduleDir: getNativeAddon().getNativeDirectory(), config: structuredClone(this.config), subCmdArgs: [] },
        event => this.onNativeEvent(event, generation))
    } catch (error) {
      await native.stop().catch(() => {})
      throw error
    }
    if (this.disposed || generation !== this.generation) { await native.stop(); return }
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
    // A health request or native.start() may still be in flight when the session ends.
    this.generation++
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
    this.endSession()
    this.resListeners.clear()
    await super.stop()
    await this.native?.stop()
  }

  public checkAuthToken(): void { this.watcher?.check() }

  /** The saved accounts the injected QQ can log in now, once its login service is ready. */
  public async listQuickLoginAccounts(): Promise<QuickLoginAccounts> {
    const native = this.native
    if (!this.get_is_connected()) return { ready: false, accounts: [] }
    // Older native bundles may still provide QR login, but cannot offer an account picker.
    if (!native?.getQuickLoginList || !native.quickLogin) throw new QuickLoginUnsupportedError(QUICK_LOGIN_UNSUPPORTED)
    // code -1: QQ not up yet, or no Auth Token; 1: logged in already
    const res = await native.getQuickLoginList()
    if (res?.code === -1) return { ready: false, accounts: [] }
    if (res?.code === 1) return { ready: true, accounts: [] }
    if (res?.code !== 0 || !Array.isArray(res.data)) throw new Error(res?.message || 'QQ 返回的快速登录账号列表无效')
    const accounts = res.data.flatMap((item: any) => {
      const uin = String(item?.uin ?? '')
      if (!/^[1-9][0-9]*$/.test(uin)) return []
      return [{ uin, uid: String(item.uid ?? ''), nick: String(item.nickName || uin), faceUrl: item.faceUrl || undefined }]
    })
    return { ready: true, accounts }
  }

  public quickLogin(uin: string): Promise<void> {
    if (!/^[1-9][0-9]*$/.test(uin)) return Promise.reject(new Error('快速登录 QQ 号必须是正整数'))
    const native = this.native
    if (!native || !this.get_is_connected()) return Promise.reject(new Error('请先启动 QQ'))
    if (!native.quickLogin) return Promise.reject(new QuickLoginUnsupportedError(QUICK_LOGIN_UNSUPPORTED))
    const generation = this.generation
    const pending = this.quickLoginPending
    if (pending?.generation === generation) {
      return pending.uin === uin ? pending.promise : Promise.reject(new Error('另一个 QQ 账号正在登录，请等待登录完成'))
    }
    const promise = this.loginAccount(native, uin, generation).finally(() => {
      if (this.quickLoginPending?.promise === promise) this.quickLoginPending = undefined
    })
    this.quickLoginPending = { uin, generation, promise }
    return promise
  }

  private async loginAccount(native: NativeQQ, uin: string, generation: number): Promise<void> {
    const checkOnline = () => {
      if (this.disposed || generation !== this.generation || !this.get_is_connected()) {
        throw new Error(this.authTokenStatus.loginError || 'QQ 桥接已停止，请重新启动 QQ')
      }
      if (!this.selfInfo.online || !this.selfInfo.uid) return false
      if (this.selfInfo.uin !== uin) throw new Error('QQ 已登录其他账号，请先在 QQ 客户端退出登录')
      return true
    }
    if (checkOnline()) return
    this.authTokenStatus.loginError = ''
    const result = await native.quickLogin(uin)
    if (result?.code !== 0 && result?.code !== 1) throw new Error(result?.message || 'QQ 尚未准备好快速登录，请稍后重试')
    // Native acceptance is not a completed login. The existing health probe owns online identity.
    const deadline = Date.now() + 60_000
    while (!checkOnline()) {
      if (this.authTokenStatus.loginError) throw new Error(this.authTokenStatus.loginError)
      if (Date.now() >= deadline) throw new Error('QQ 登录超时，请在 QQ 客户端确认登录状态或扫码登录')
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  public get_is_connected(): boolean { return this.connected && !this.disposed }

  private onNativeEvent(event: any, generation: number): void {
    if (this.disposed || generation !== this.generation) return
    if (event.type === 'error') {
      const reason = event.message || 'NativeQQ 会话失败'
      this.logger.error(reason)
      void this.sessionEnded(reason).catch(error => this.logger.error('清理登录资源失败', error))
      return
    }
    if (event.type === 'status' && event.data?.status === 'stopped') {
      void this.sessionEnded(event.message || 'NativeQQ 会话已结束').catch(error => this.logger.error('清理登录资源失败', error))
      return
    }
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

  private async sessionEnded(reason: string): Promise<void> {
    const hadLogin = !!(this.selfInfo.uin && this.selfInfo.uid)
    this.authTokenStatus.loginError = reason
    this.disconnect()
    this.endSession()
    // Notify while consumers can still identify the lost login. stop() and a normal QQ logout do not use this path.
    if (hadLogin) void this.ctx.parallel('qq/session-expired', reason)
      .catch(error => this.logger.error('发送离线通知失败', error))
    await this.clearLogin()
  }

  // WebUI starts us through a Cordis service proxy. Keep each poll on the owning instance:
  // calling a prototype method on the previous poll's shadow would grow the proxy chain forever.
  private probe = async (generation: number): Promise<void> => {
    if (this.disposed || generation !== this.generation) return
    try {
      const health = await this.native!.health()
      if (this.disposed || generation !== this.generation) return
      if (health.failure || ['stopped', 'failed'].includes(health.sessionStatus)) {
        await this.sessionEnded(health.failure || 'NativeQQ 会话已结束')
        return
      }
      if (Number(health.uin) > 0 && typeof health.uid === 'string' && health.uid.trim()) {
        if ((this.selfInfo.uin || this.selfInfo.uid) &&
          (this.selfInfo.uin !== String(health.uin) || this.selfInfo.uid !== health.uid)) {
          await this.clearLogin()
          if (this.disposed || generation !== this.generation) return
        }
        const newlyOnline = !this.selfInfo.online
        this.selfInfo.uid = health.uid
        this.selfInfo.uin = String(health.uin)
        this.selfInfo.online = true
        this.maybeEmitOnline()
        if (newlyOnline) this.scheduleFetchSelfNick(() => !this.disposed && generation === this.generation &&
          this.selfInfo.uid === health.uid && this.selfInfo.uin === String(health.uin))
      } else {
        if (this.selfInfo.online) { this.disconnect(); this.connected = true }
        if (this.selfInfo.uid || this.selfInfo.uin) await this.clearLogin()
        if (this.disposed || generation !== this.generation) return
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
