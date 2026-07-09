import { deepConvertMap, deepStringifyMap } from './util'
import { selfInfo } from '@/common/globalVars'
import { randomUUID, createHash } from 'node:crypto'
import type {
  PMHQRes,
  PMHQReq,
  PMHQResSendPB,
  PBData,
  ResListener,
} from './types'
import { Context } from 'cordis'
import { buildSsoInfoSync } from './direct'
import { QQProtocolBase } from './base'

/**
 * PMHQ 模式实现: WS(优先) + HTTP 回退 与 PMHQ dll 通信.
 * QQ NT 早已登录, LLBot 寄生其上; 靠 /health 轮询拿 uin/uid.
 */
export class PmhqQQProtocol extends QQProtocolBase {
  private reconnectTimer: NodeJS.Timeout | undefined
  protected httpUrl: string
  protected wsUrl: string
  protected ws: WebSocket | undefined
  private resListeners: Map<string, ResListener<any>> = new Map()
  private hasConnectedOnce: boolean = false
  private hasLoggedConnectionError: boolean = false
  // 探测会话的取消令牌: 每次 WS open 启动一次新的探测, token 自增;
  // 任何 setTimeout/listener 回调发现自己的 token 不是当前 token 就什么都不做并主动清理。
  private pmhqProbeToken: number = 0

  constructor(ctx: Context) {
    super(ctx)
    const { pmhqHost, pmhqPort } = this.getPMHQHostPort()
    this.httpUrl = `http://${pmhqHost}:${pmhqPort}/`
    this.wsUrl = `ws://${pmhqHost}:${pmhqPort}/ws`
  }

  protected async start(): Promise<void> {
    // 订阅 recv 事件, 转发为 qq/raw 供 dispatcher 用. (旧代码里叫 startHook, 现在归内部)
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

  public async getLoginQrCode(): Promise<{ qrcodeUrl: string; pngBase64QrcodeData: string }> {
    throw new Error('PMHQ 模式不支持扫码登录 (QQ NT 已完成登录)')
  }

  // ---- PMHQ 内部: 登录探测 + 状态复位 ----

  /**
   * PMHQ 模式下 LLBot 是寄生在 QQ NT 上的, QQ NT 早就登录过了, 开机时的 InfoSyncPush 也早处理完.
   * LLBot 想要群最新 seq (拉历史用) 就得自己主动触发一次: 发 SsoInfoSync, server 看到注册请求就回一发 InfoSyncPush.
   * isFirstRegisterProxyOnline=0 + 派生 guid (基于 uid, 每个号固定) 尽量避免和 QQ NT 的注册项冲突.
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
    if (wasOnline) {
      this.ctx.parallel('protocol/disconnect')
    }
  }

  /**
   * PMHQ 模式: 轮询 /health 拿 self uin/uid (DLL 从 QQ 内存直接读 uin,
   * injector 侧扫 recv pb 抠 uid, 都写到 /health). 拿到 uin+uid 立即 emit online,
   * nick 通过 scheduleFetchSelfNick 异步等 ntUserApi 服务 ready 后再拉.
   * 重连后会被 onopen 再次调用, 所以必须先 reset 旧状态再启动新一轮.
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
          this.scheduleFetchSelfNick(() => this.pmhqProbeToken === myToken)
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

  // ---- PMHQ 内部: 传输层 (WS / HTTP) ----

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
        this.lastConnectedTime = Date.now()
      }
      // 每次(重)连成功后重新走一遍登录探测
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
   * 解包 PMHQ active-send 响应. echo 只用于关联请求, 不能"echo 匹配就算成功":
   * PMHQ 即使发包失败 / QQ 未登录, 也会回一条 echo 匹配但 code 非 0 的响应.
   * 成败一律看 code: 0 = QQ 真回包 (已登录); 非 0 (-100 未登录/KernelMsgService 缺失/管道未连,
   * 或 QQ app error) 一律抛错, 不让上层拿空 pb 去 decode.
   */
  private unwrapPmhqRes(res: PMHQResSendPB, cmd: string): PBData {
    if (res.code != null && res.code !== 0) {
      const pb = res.data?.pb ?? ''
      const detail = pb ? ` pb=${pb.slice(0, 160)}` : ' pb=<empty>'
      throw new Error(`PMHQ send failed: cmd=${cmd} code=${res.code} ${res.message ?? ''}${detail}`.trim())
    }
    return res.data
  }
}
