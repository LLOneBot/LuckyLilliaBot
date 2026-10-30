import { deepConvertMap } from './util'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PMHQRes, PMHQResSendPB, PMHQHealth, PBData, QQResourceUsage, ResListener } from './types'
import { Context } from 'cordis'
import { currentPmhqTarget, getCdn, getSpecifiedUin } from '@/common/utils/environment'
import { getNativeAddon, type NativeQQ } from '@/native'
import { authTokenUtil } from '@/main/config'
import { AuthTokenWatcher } from './direct-lib/authTokenWatcher'
import { QQProtocolBase } from './base'
import { registerPmhqControls } from '../llbot-ipc'

/** The protocol owns one native session, its token watcher, and every polling timer. */
export class PmhqQQProtocol extends QQProtocolBase {
  private native?: NativeQQ
  private watcher?: AuthTokenWatcher
  private probeTimer?: NodeJS.Timeout
  private connected = false
  private generation = 0
  private resListeners = new Map<string, ResListener<any>>()
  private unregisterControls?: () => void

  constructor(ctx: Context) { super(ctx) }

  protected async start(): Promise<void> {
    const addon = getNativeAddon()
    const target = currentPmhqTarget()
    let config: Record<string, unknown> = {}
    if (target.configPath) {
      if (!path.isAbsolute(target.configPath)) throw new Error('PMHQ 配置文件必须使用绝对路径')
      config = JSON.parse(readFileSync(target.configPath, 'utf8'))
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('PMHQ 配置必须是 JSON 对象')
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
    // Host lifecycle replaces the former pmhq -> Bot subprocess topology.
    delete config.sub_cmd
    const configuredToken = typeof config.auth_token === 'string' ? config.auth_token : ''
    config.auth_token = ''
    config.cdn ||= getCdn()
    const native = this.native = new addon.NativeQQ()
    const generation = ++this.generation
    try {
      await native.start({ moduleDir: addon.getNativeDirectory(), config, subCmdArgs: [] }, event => this.onNativeEvent(event, generation))
      if (this.disposed) { await native.stop(); return }
      this.connected = true
      this.lastConnectedTime = Date.now()
      this.watcher = new AuthTokenWatcher(this.authTokenStatus, async token => {
        try { await native.setAuthToken(token) }
        catch (error) {
          if (this.disposed) return
          this.authTokenStatus.validation = 'error'
          this.authTokenStatus.message = (error as Error).message
          throw error
        }
      }, this.logger, () => this.selfInfo.online,
      () => authTokenUtil.reload() || (process.env.AUTH_TOKEN || '').trim() || configuredToken)
      this.watcher.start()
      this.unregisterControls = registerPmhqControls({
        health: () => native.health(),
        qrcode: () => native.getLoginQrcode(),
        setAuthToken: async token => { await native.setAuthToken(token); this.authTokenStatus.hasToken = true; this.authTokenStatus.validation = 'valid' },
      })
      void this.probe(generation)
    } catch (error) {
      await this.stop().catch(() => {})
      throw error
    }
  }

  protected async stop(): Promise<void> {
    this.generation++
    this.connected = false
    this.watcher?.stop()
    this.unregisterControls?.()
    this.unregisterControls = undefined
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.probeTimer = undefined
    this.resListeners.clear()
    await super.stop()
    await this.native?.stop()
  }

  public checkAuthToken(): void { this.watcher?.check() }
  public get_is_connected(): boolean { return this.connected && !this.disposed }

  private onNativeEvent(event: any, generation: number): void {
    if (this.disposed || generation !== this.generation) return
    if (event.type === 'error') {
      this.authTokenStatus.loginError = event.message || 'PMHQ 会话失败'
      this.logger.error(this.authTokenStatus.loginError)
      this.disconnect()
      this.watcher?.stop()
      return
    }
    if (event.type === 'status' && event.data?.status === 'stopped') { this.disconnect(); return }
    if (event.type === 'lagged') { this.logger.warn('PMHQ 事件消费过慢，丢失 %s 个事件', event.data?.dropped); return }
    if (event.type !== 'send' && event.type !== 'recv') return
    const data = deepConvertMap(event) as PMHQRes
    if (data.type === 'recv' && data.data?.cmd && data.data?.pb) {
      // Debugger captures may contain the MSF length header; protocol decoders expect bare PB.
      // Match NativeQQ.send() normalization so callbacks and direct replies use the same format.
      let payload = Buffer.from(data.data.pb, 'hex')
      if (payload.length >= 4) {
        const size = payload.readUInt32BE(0)
        if (size === payload.length || size === payload.length - 4) payload = payload.subarray(4)
      }
      data.data.pb = payload.toString('hex')
      void this.ctx.parallel('qq/raw', { cmd: data.data.cmd, payload }).catch(error => this.logger.error('PMHQ raw listener failed', error))
    }
    for (const listener of this.resListeners.values()) {
      try { listener(data) } catch (error) { this.logger.error('PMHQ listener failed', error) }
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
        this.authTokenStatus.loginError = health.failure || 'PMHQ 会话已结束'
        this.disconnect()
        this.watcher?.stop()
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
    } catch (error) { if (!this.disposed) this.logger.debug('PMHQ health failed: %s', (error as Error).message) }
    if (!this.disposed && generation === this.generation) this.probeTimer = setTimeout(() => void this.probe(generation), 1000)
  }

  public async sendPB(cmd: string, pb: Buffer | string, timeout = 15000): Promise<PBData> {
    if (!this.get_is_connected() || !this.native) throw new Error('PMHQ 协议未运行')
    let timer: NodeJS.Timeout | undefined
    try {
      const res = await Promise.race([
        this.native.send(cmd, pb, randomUUID()) as Promise<PMHQResSendPB>,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PMHQ send timeout')), timeout) }),
      ])
      if (res.code != null && res.code !== 0) throw new Error('PMHQ send failed: ' + cmd + ' code=' + res.code + ' ' + (res.message || ''))
      if (!res.data) throw new Error('PMHQ send returned no payload')
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
      const { memory, cpu, qq_full_version } = await this.native!.health() as PMHQHealth
      if (!memory || !cpu) return null
      return { memory: memory.qq_using, totalMemory: memory.total,
        memoryPercent: memory.total > 0 ? memory.qq_using / memory.total * 100 : 0,
        cpu: Math.min(100, Math.max(0, cpu.qq_using / (cpu.total || 1) * 100)), version: qq_full_version || undefined }
    } catch { return null }
  }

  public addResListener<R extends PMHQRes>(listener: ResListener<R>): string {
    const id = randomUUID(); this.resListeners.set(id, listener); return id
  }
  public removeResListener(id: string): void { this.resListeners.delete(id) }
  public async waitConnected(): Promise<boolean> {
    if (!this.get_is_connected()) throw new Error('PMHQ 协议未运行')
    return true
  }
}
