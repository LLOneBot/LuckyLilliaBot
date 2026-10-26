import { deepConvertMap, deepStringifyMap } from './util'
import { selfInfo } from '@/common/globalVars'
import { randomUUID, createHash } from 'node:crypto'
import type {
  PMHQRes,
  PMHQReq,
  PMHQResSendPB,
  PMHQHealth,
  PBData,
  QQResourceUsage,
  ResListener,
} from './types'
import { Context } from 'cordis'
import { getPmhqTarget } from '@/common/utils/environment'
import { buildSsoInfoSync } from './direct-lib'
import { QQProtocolBase } from './base'

/** 跟 PMHQ 通信 (WS 优先, HTTP 回退)。QQ NT 已经登录, 靠轮询 /health 拿 uin / uid */
export class PmhqQQProtocol extends QQProtocolBase {
  private reconnectTimer: NodeJS.Timeout | undefined
  protected httpUrl: string
  protected wsUrl: string
  protected ws: WebSocket | undefined
  private resListeners: Map<string, ResListener<any>> = new Map()
  private hasConnectedOnce: boolean = false
  private hasLoggedConnectionError: boolean = false
  // 每次 WS open 自增, 旧一轮探测的回调见它变了就退出
  private pmhqProbeToken: number = 0

  constructor(ctx: Context) {
    super(ctx)
    // 只有 PMHQ 模式才会用这个类, ?? 只为收窄类型
    const { host, port } = getPmhqTarget() ?? { host: '127.0.0.1', port: '13000' }
    this.httpUrl = `http://${host}:${port}/`
    this.wsUrl = `ws://${host}:${port}/ws`
  }

  protected async start(): Promise<void> {
    this.addResListener((data: any) => {
      if (data?.type === 'recv' && data.data?.cmd && data.data?.pb) {
        const payload = Buffer.from(data.data.pb, 'hex')
        this.ctx.parallel('qq/raw', { cmd: data.data.cmd, payload })
      }
    })
    await this.connectWebSocket()
  }

  public get_is_connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN
  }

  public async sendPB(cmd: string, pb: Buffer | string, timeout = 15000): Promise<PBData> {
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

  /** QQ 未登录时 PMHQ 注入的 JS 会自己拉码, 这里只读接口 */
  protected async fetchFreshQrCode(): Promise<{ qrcodeUrl: string; pngBase64: string; expireTimeSec: number; sig: string } | null> {
    const res = await this.fetchPmhqQrcode()
    if (res.code === 0 && res.data) {
      return {
        qrcodeUrl: res.data.qrcodeUrl,
        pngBase64: res.data.pngBase64QrcodeData,
        expireTimeSec: res.data.expireTime,
        sig: res.data.qrcodeUrl,
      }
    }
    return null
  }

  /**
   * 开机时的 InfoSyncPush 早被 QQ 处理掉了, 要群最新 seq 得自己发一次 SsoInfoSync。guid 从 uid 派生,
   * 避免跟 QQ 的注册项冲突
   */
  private async triggerInfoSyncPush() {
    const seed = selfInfo.uid || selfInfo.uin || 'llbot'
    const guid: Buffer = createHash('md5').update(`llbot-${seed}`).digest().subarray(0, 16)
    const payload = buildSsoInfoSync(guid, false)
    await this.sendPB('trpc.msg.register_proxy.RegisterProxy.SsoInfoSync', payload, 5000)
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
    this.resetQrState()
    if (wasOnline) {
      this.ctx.parallel('protocol/disconnect')
    }
  }

  /** 重连后 onopen 会再调一次, 所以先复位旧状态 */
  private startPmhqLoginProbe() {
    this.resetPmhqState()
    const myToken = ++this.pmhqProbeToken

    let warnedNotLoggedIn = false
    const probe = async () => {
      if (this.pmhqProbeToken !== myToken) return
      try {
        const resp = await fetch(`${this.httpUrl}health`)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const health = await resp.json() as PMHQHealth
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
          this.scheduleFetchSelfNick(() => this.pmhqProbeToken === myToken)
        } else {
          // 只在 QQ 未登录时拉码, 不然 get_login_qrcode 返回已登录, 刷屏 QR code unavailable
          this.ensureQrLoop()
          if (!warnedNotLoggedIn) {
            this.logger.info('QQ 未登录，等待登录中...')
            warnedNotLoggedIn = true
          }
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

  /** code: 0 拿到码, 1 已登录, -1 未就绪或已过期 (重试会拿到新码) */
  private async fetchPmhqQrcode(): Promise<{
    code: number
    message?: string
    data?: { pngBase64QrcodeData: string; qrcodeUrl: string; expireTime: number; pollTimeInterval: number }
  }> {
    const resp = await fetch(`${this.httpUrl}get_login_qrcode`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.json()
  }

  /** cpu 是相邻两次 /health 之间的均值, 第一次为 0。老 PMHQ 没有这两个字段, 返回 null */
  public async getQQResourceUsage(): Promise<QQResourceUsage | null> {
    try {
      const resp = await fetch(`${this.httpUrl}health`, { signal: AbortSignal.timeout(3000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const { memory, cpu, qq_full_version } = (await resp.json()) as PMHQHealth
      if (!memory || !cpu) return null
      return {
        memory: memory.qq_using,
        totalMemory: memory.total,
        memoryPercent: memory.total > 0 ? (memory.qq_using / memory.total) * 100 : 0,
        cpu: Math.min(100, Math.max(0, (cpu.qq_using / (cpu.total || 1)) * 100)),
        version: qq_full_version || undefined,
      }
    } catch (e) {
      this.logger.debug('PMHQ /health 取资源占用失败: %s', (e as Error).message)
      return null
    }
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
        this.lastConnectedTime = Date.now()
      }
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

  /** echo 匹配不代表成功: 发包失败或 QQ 未登录时 PMHQ 也会回 echo 匹配、code 非 0 的响应, 一律抛错 */
  private unwrapPmhqRes(res: PMHQResSendPB, cmd: string): PBData {
    if (res.code != null && res.code !== 0) {
      const pb = res.data?.pb ?? ''
      const detail = pb ? ` pb=${pb.slice(0, 160)}` : ' pb=<empty>'
      throw new Error(`PMHQ send failed: cmd=${cmd} code=${res.code} ${res.message ?? ''}${detail}`.trim())
    }
    return res.data
  }
}
