import { deepConvertMap, deepStringifyMap } from './util'
import { selfInfo } from '@/common/globalVars'
import { randomUUID } from 'node:crypto'
import type {
  PMHQRes,
  PMHQReq,
  PMHQResSendPB,
  PMHQResCall,
  PMHQReqCall,
  PMHQReqTellPort,
  PBData,
  QQProcessInfo,
  ResListener,
} from './types'
import { Context, Service } from 'cordis'
import { NodeIKernelAlbumService, NodeIKernelBuddyService, NodeIKernelFlashTransferService, NodeIKernelGroupService, NodeIKernelLoginService, NodeIKernelMSFService, NodeIKernelMsgService, NodeIKernelNodeMiscService, NodeIKernelProfileLikeService, NodeIKernelProfileService, NodeIKernelRecentContactService, NodeIKernelRichMediaService, NodeIKernelRobotService, NodeIKernelTicketService, NodeIKernelTipOffService, NodeIKernelUixConvertService } from '@/ntqqapi/services'
import { NodeIKernelBuddyListener, NodeIKernelGroupListener, NodeIKernelLoginListener, NodeIKernelMsgListener } from '@/ntqqapi/listeners'
import { Awaitable } from 'cosmokit'
import { NTMethod } from '@/ntqqapi/ntcall'
import { ReceiveCmdS } from '@/ntqqapi/hook'
import { inspect } from 'node:util'
import { DetailedError } from '@/common/utils'
import { parseProtobufFromHex } from '@/common/utils/protobuf-parser'

type DisconnectCallback = (duration: number) => void

interface DisconnectCallbackInfo {
  timeout: number
  callback: DisconnectCallback
  triggered: boolean
}

interface NTService {
  nodeIKernelLoginService: NodeIKernelLoginService
  nodeIKernelBuddyService: NodeIKernelBuddyService
  nodeIKernelProfileService: NodeIKernelProfileService
  nodeIKernelGroupService: NodeIKernelGroupService
  nodeIKernelProfileLikeService: NodeIKernelProfileLikeService
  nodeIKernelMsgService: NodeIKernelMsgService
  nodeIKernelMSFService: NodeIKernelMSFService
  nodeIKernelUixConvertService: NodeIKernelUixConvertService
  nodeIKernelRichMediaService: NodeIKernelRichMediaService
  nodeIKernelTicketService: NodeIKernelTicketService
  nodeIKernelTipOffService: NodeIKernelTipOffService
  nodeIKernelRobotService: NodeIKernelRobotService
  nodeIKernelNodeMiscService: NodeIKernelNodeMiscService
  nodeIKernelRecentContactService: NodeIKernelRecentContactService
  nodeIKernelFlashTransferService: NodeIKernelFlashTransferService
  nodeIKernelAlbumService: NodeIKernelAlbumService
}

interface InvokeOptions<ReturnType> {
  resultCmd?: string // 表示这次call是异步的，返回结果会通过这个命令上报
  resultCb?: (data: ReturnType, firstResult: any) => boolean // 结果回调，直到返回true才会移除钩子
  timeout?: number
}

interface NTListener {
  nodeIKernelLoginListener: NodeIKernelLoginListener
  nodeIKernelBuddyListener: NodeIKernelBuddyListener
  nodeIKernelGroupListener: NodeIKernelGroupListener
  nodeIKernelMsgListener: NodeIKernelMsgListener
}

// 辅助类型：从method字符串推断出对应的payload类型
type InferPayloadFromMethod<T extends string> =
  T extends `${infer S}/${infer M}`
  ? S extends keyof NTListener
  ? M extends keyof NTListener[S]
  ? NTListener[S][M] extends (...args: any) => unknown
  ? Parameters<NTListener[S][M]>[0]
  : never
  : never
  : never
  : never

const NT_SERVICE_TO_PMHQ: Record<string, string> = {
  'nodeIKernelBuddyService': 'getBuddyService',
  'nodeIKernelProfileService': 'getProfileService',
  'nodeIKernelGroupService': 'getGroupService',
  'nodeIKernelProfileLikeService': 'getProfileLikeService',
  'nodeIKernelMsgService': 'getMsgService',
  'nodeIKernelMSFService': 'getMSFService',
  'nodeIKernelUixConvertService': 'getUixConvertService',
  'nodeIKernelRichMediaService': 'getRichMediaService',
  'nodeIKernelTicketService': 'getTicketService',
  'nodeIKernelTipOffService': 'getTipOffService',
  'nodeIKernelRobotService': 'getRobotService',
  'nodeIKernelNodeMiscService': 'getNodeMiscService',
  'nodeIKernelRecentContactService': 'getRecentContactService',
  'nodeIKernelFlashTransferService': 'getFlashTransferService',
  'nodeIKernelLoginService': 'loginService',
  'nodeIKernelAlbumService': 'getAlbumService',
}
const NOT_SESSION_SERVICES = ['nodeIKernelLoginService']

const NT_RECV_PMHQ_TYPE_TO_NT_METHOD = {
  'on_message': 'nodeIKernelMsgListener',
  'on_group': 'nodeIKernelGroupListener',
  'on_buddy': 'nodeIKernelBuddyListener',
  'on_profile': 'nodeIKernelProfileListener',
  'on_flash_file': 'nodeIKernelFlashTransferListener',
}

const logHook = false

export class PMHQBase extends Service {
  static inject = ['logger', 'config']

  private reconnectTimer: NodeJS.Timeout | undefined
  protected httpUrl: string = 'http://127.0.0.1:13000'
  protected wsUrl: string = 'ws://127.0.0.1:13000/ws'
  protected ws: WebSocket | undefined
  private resListeners: Map<string, ResListener<any>> = new Map()
  private disconnectCallbacks: Map<string, DisconnectCallbackInfo> = new Map()
  private lastConnectedTime: number = Date.now()
  private disconnectCheckTimer: NodeJS.Timeout | undefined
  private hasConnectedOnce: boolean = false
  private hasLoggedConnectionError: boolean = false
  private receiveHooks: Map<string, {
    method: ReceiveCmdS[]
    hookFunc: (payload: any) => Awaitable<void>
  }> = new Map()
  private callHooks: Map<
    NTMethod,
    (callParams: unknown[]) => Awaitable<void>
  > = new Map()
  public msgPBMap: Map<string, string> = new Map<string, string>()
  private logger

  constructor(protected ctx: Context) {
    super(ctx, 'pmhq')
    this.logger = ctx.logger('pmhq')
    this.logger.info(process.argv)
    const { pmhqHost, pmhqPort } = this.getPMHQHostPort()
    this.httpUrl = `http://${pmhqHost}:${pmhqPort}/`
    this.wsUrl = `ws://${pmhqHost}:${pmhqPort}/ws`
    this.connectWebSocket().then()
  }

  public get_is_connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }

  public onDisconnect(timeout: number, callback: DisconnectCallback): string {
    const id = randomUUID()
    this.disconnectCallbacks.set(id, { timeout, callback, triggered: false })
    // console.info(`[PMHQ] Registered disconnect callback ${id} with timeout ${timeout}ms`)
    return id
  }

  public offDisconnect(id: string): void {
    this.disconnectCallbacks.delete(id)
  }

  private startDisconnectMonitoring() {
    if (this.disconnectCheckTimer) return

    // console.info('[PMHQ] Starting disconnect monitoring')
    this.disconnectCheckTimer = setInterval(() => {
      const isConnected = this.get_is_connected()

      if (isConnected) {
        this.lastConnectedTime = Date.now()
        for (const info of this.disconnectCallbacks.values()) {
          info.triggered = false
        }
      } else {
        const disconnectedDuration = Date.now() - this.lastConnectedTime

        for (const info of this.disconnectCallbacks.values()) {
          if (!info.triggered && disconnectedDuration >= info.timeout) {
            info.triggered = true
            this.logger.warn(`[PMHQ] Triggering disconnect callback, duration: ${disconnectedDuration}ms, timeout: ${info.timeout}ms`)
            try {
              info.callback(disconnectedDuration)
            } catch (e) {
              this.logger.error('PMHQ disconnect callback error', e)
            }
          }
        }
      }
    }, 5000)
  }

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

      if (!this.hasLoggedConnectionError) {
        this.logger.error('PMHQ WebSocket 连接错误，可能 QQ 未启动，正在等待 QQ 启动进行重连...')
        this.hasLoggedConnectionError = true
      }

      reconnect()
    }

    this.ws.onclose = () => {
      selfInfo.online = false

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
        this.startDisconnectMonitoring()
      }
    }
  }

  public async call(func: string, args: unknown[], timeout = 10000) {
    const payload: PMHQReqCall = {
      type: 'call',
      data: { func, args },
    }
    const result = ((await this.wsSend(payload, timeout)) as PMHQResCall).data?.result
    return result
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

  public async tellPort(webuiPort: number) {
    const echo = randomUUID()
    const payload: PMHQReqTellPort = {
      type: 'broadcast_event',
      data: { echo, type: 'llbot_web_ui_port', data: { echo, port: webuiPort } },
    }
    return await this.wsSend(payload, 5000)
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

  public async httpSendPB(cmd: string, pb: Uint8Array): Promise<PBData> {
    return (
      await this.httpSend<PMHQResSendPB>({
        type: 'send',
        data: { cmd, pb: Buffer.from(pb).toString('hex') },
      })
    ).data
  }

  public async wsSendPB(cmd: string, pb: Uint8Array): Promise<PBData> {
    return (
      await this.wsSend<PMHQResSendPB>({
        type: 'send',
        data: { cmd, pb: Buffer.from(pb).toString('hex') },
      })
    ).data
  }

  async sendPB(cmd: string, hex: string): Promise<PBData> {
    return (
      await this.wsSend<PMHQResSendPB>({
        type: 'send',
        data: { cmd, pb: hex },
      })
    ).data
  }

  async getProcessInfo(): Promise<QQProcessInfo | null> {
    try {
      return await this.call('getProcessInfo', [])
    } catch {
      return null
    }
  }

  // 函数重载：当提供resultCmd时，自动从resultCmd推断返回类型
  invoke<
    ResultCmd extends string,
    R extends InferPayloadFromMethod<ResultCmd>,
    S extends keyof NTService = any,
    M extends keyof NTService[S] & string = any,
    P extends Parameters<Extract<NTService[S][M], (...args: any) => unknown>> = any
  >(
    method: Extract<unknown, `${S}/${M}`> | string,
    args: P,
    options: InvokeOptions<R> & { resultCmd: ResultCmd }
  ): Promise<R>

  // 函数重载：当不提供resultCmd时，使用原来的类型推断
  invoke<
    R extends Awaited<ReturnType<Extract<NTService[S][M], (...args: any) => unknown>>>,
    S extends keyof NTService = any,
    M extends keyof NTService[S] & string = any,
    P extends Parameters<Extract<NTService[S][M], (...args: any) => unknown>> = any
  >(
    method: Extract<unknown, `${S}/${M}`> | string,
    args: P,
    options?: InvokeOptions<R>
  ): Promise<R>

  // 实际实现
  invoke<
    R = any,
    S extends keyof NTService = any,
    M extends keyof NTService[S] & string = any,
    P extends Parameters<Extract<NTService[S][M], (...args: any) => unknown>> = any
  >(method: Extract<unknown, `${S}/${M}`> | string, args: P, options: InvokeOptions<R> = {}): Promise<R> {
    const splitMethod = method.split('/')
    const serviceName = splitMethod[0] as keyof NTService
    const methodName = splitMethod.slice(1).join('/')
    const pmhqService = NT_SERVICE_TO_PMHQ[serviceName]
    let funcName = ''
    if (pmhqService) {
      if (NOT_SESSION_SERVICES.includes(serviceName))
        funcName = `${pmhqService}.${methodName}`
      else {
        funcName = `wrapperSession.${pmhqService}().${methodName}`
      }
    }
    else {
      funcName = method
    }
    const timeout = options.timeout ?? 15000

    return new Promise<R>((resolve, reject) => {
      let timeoutId = null
      let hookId: string = ''
      if (timeout) {
        timeoutId = setTimeout(() => {
          this.removeReceiveHook(hookId)
          const display = inspect(args, {
            depth: 10,
            compact: true,
            breakLength: Infinity,
            maxArrayLength: 220
          })
          reject(new Error(`invoke timeout, ${funcName}, ${display}`))
        }, timeout)
      }
      if (options.resultCmd) {
        let firstResult: unknown = undefined
        hookId = this.registerReceiveHook<R>(options.resultCmd as string, (data: R) => {
          if (options.resultCb && !options.resultCb(data, firstResult)) {
            return
          }
          resolve(data)
          this.removeReceiveHook(hookId)
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        })
        this.call(funcName, args, timeout).then(r => {
          firstResult = r
          if (r && Object.hasOwn(r, 'result') && +r.result !== 0) {
            const displayReq = inspect(args, {
              depth: 10,
              compact: true,
              breakLength: Infinity,
              maxArrayLength: 220
            })
            const displayRes = inspect(r, {
              depth: 10,
              compact: true,
              breakLength: Infinity,
              maxArrayLength: 220
            })
            reject(new DetailedError(`invoke failed, ${funcName}, ${displayReq}, ${displayRes}`, r))
            this.removeReceiveHook(hookId)
            if (timeoutId) {
              clearTimeout(timeoutId)
            }
          }
        }).catch(reject)
      }
      else {
        this.call(funcName, args, timeout).then(r => {
          resolve(r)
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        }).catch(reject)
      }
    })
  }

  registerReceiveHook<
    PayloadType = any,
    Method extends string = string
  >(
    method: Method | Method[],
    hookFunc: (payload: InferPayloadFromMethod<Method> extends never ? PayloadType : InferPayloadFromMethod<Method>) => Awaitable<void>,
  ): string {
    const id = randomUUID()
    if (!Array.isArray(method)) {
      method = [method]
    }
    this.receiveHooks.set(id, {
      method: method as ReceiveCmdS[],
      hookFunc,
    })
    return id
  }


  registerCallHook(
    method: NTMethod,
    hookFunc: (callParams: unknown[]) => Awaitable<void>,
  ): void {
    this.callHooks.set(method, hookFunc)
  }

  removeReceiveHook(id: string) {
    this.receiveHooks.delete(id)
  }

  startHook() {
    this.addResListener((data) => {
      const listenerName = data.type
      if (data.data && 'sub_type' in data.data) {
        const sub_type = data.data.sub_type
        const convertedListenerName = NT_RECV_PMHQ_TYPE_TO_NT_METHOD[listenerName as keyof typeof NT_RECV_PMHQ_TYPE_TO_NT_METHOD] || listenerName
        const ntCmd: ReceiveCmdS = (convertedListenerName + '/' + sub_type) as ReceiveCmdS
        if (logHook) {
          this.logger.info(ntCmd, data.data)
        }
        for (const hook of this.receiveHooks.values()) {
          if (hook.method.includes(ntCmd)) {
            Promise.resolve(hook.hookFunc(data.data.data))
          }
        }
      }
      else if (data.type === 'recv' && data.data.cmd === 'trpc.msg.olpush.OlPushService.MsgPush') {
        if (this.ctx.config.get().rawMsgPB) {
          const msg = parseProtobufFromHex(data.data.pb)
          try {
            const peerId = msg[1][1][8][1]
            const msgRand = msg[1][2][4]
            const msgSeq = msg[1][2][5]
            const uniqueId = `${peerId}_${msgRand}_${msgSeq}`
            if (this.msgPBMap.size > 1000) {
              // 删除最老的记录
              const firstKey = this.msgPBMap.keys().next().value
              this.msgPBMap.delete(firstKey!)
            }
            this.msgPBMap.set(uniqueId, data.data.pb)
          } catch (e) {

          }
        }
      }
    })
  }
}
