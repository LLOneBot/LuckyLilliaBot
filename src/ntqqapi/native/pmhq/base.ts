import { deepConvertMap, deepStringifyMap } from '@/ntqqapi/native/pmhq/util'
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

type DisconnectCallback = (duration: number) => void

interface DisconnectCallbackInfo {
  timeout: number
  callback: DisconnectCallback
  triggered: boolean
}

export class PMHQBase {
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

  constructor() {
    console.log(process.argv)
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
            console.warn(`[PMHQ] Triggering disconnect callback, duration: ${disconnectedDuration}ms, timeout: ${info.timeout}ms`)
            try {
              info.callback(disconnectedDuration)
            } catch (e) {
              console.error('PMHQ disconnect callback error', e)
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
        console.error('解析 PMHQ 消息失败', event.data, e)
        return
      }
      data = deepConvertMap(data)
      for (const func of this.resListeners.values()) {
        setImmediate(() => {
          try {
            func(data)
          } catch (e) {
            console.error('PMHQ res listener error', e)
          }
        })
      }
    }

    this.ws.onerror = () => {
      selfInfo.online = false

      if (!this.hasLoggedConnectionError) {
        console.error('PMHQ WebSocket 连接错误，可能 QQ 未启动，正在等待 QQ 启动进行重连...')
        this.hasLoggedConnectionError = true
      }

      reconnect()
    }

    this.ws.onclose = () => {
      selfInfo.online = false

      if (!this.hasLoggedConnectionError) {
        console.info('PMHQ WebSocket 连接关闭，准备重连...')
        this.hasLoggedConnectionError = true
      }

      reconnect()
    }

    this.ws.onopen = () => {
      console.info('PMHQ WebSocket 连接成功')
      this.hasLoggedConnectionError = false
      if (!this.hasConnectedOnce) {
        this.hasConnectedOnce = true
        this.startDisconnectMonitoring()
      }
    }
  }

  public async call(func: string, args: any, timeout = 10000): Promise<any> {
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
          console.error(`PMHQ WS send error: payload ${JSON.stringify(data)}, response ${JSON.stringify(res)}`)
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
}
