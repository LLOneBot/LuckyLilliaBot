import { Context } from 'cordis'
import { WebSocket } from 'ws'
import { Oidb } from '@/ntqqapi/proto/compiled'
import { selfInfo } from '@/common/globalVars'
import { Field } from 'minato'
import string = Field.string
import path from 'node:path'
import * as os from 'node:os'
import fs from 'node:fs'
import { deepConvertMap, deepStringifyMap } from '@/ntqqapi/native/pmhq/util'
import { randomUUID } from 'node:crypto'

interface PBData {
  echo?: string
  cmd: string
  pb: string
}

interface CallResultData {
  echo?: string
  result: any
}

interface OnListenerData {
  echo: string | null
  sub_type: string
  data: any
}

interface PMHQResSendPB {
  type: 'send'
  data: PBData
}

interface PMHQResRecvPB {
  type: 'recv',
  data: PBData
}

interface PMHQResOn {
  type: 'on_message' | 'on_buddy' | 'on_group',
  data: OnListenerData
}

interface PMHQResCall {
  type: 'call',
  data: CallResultData
}

interface PMHQReqSendPB {
  type: 'send',
  data: PBData
}

interface PMHQReqCall {
  type: 'call',
  data: {
    echo?: string
    func: string,
    args: any[]
  }
}

export type PMHQRes = PMHQResSendPB | PMHQResRecvPB | PMHQResOn | PMHQResCall

export type PMHQReq = PMHQReqSendPB | PMHQReqCall

interface ResListener<R extends PMHQRes> {
  (data: R): void
}

export class PMHQ {
  private reconnectTimer: NodeJS.Timeout | undefined
  private httpUrl: string = 'http://127.0.0.1:13000'
  private wsUrl: string = 'ws://127.0.0.1:13000/ws'
  private ws: WebSocket | undefined
  private resListeners: Map<string, ResListener<any>> = new Map()

  constructor() {
    console.log(process.argv)
    const {pmhqHost, pmhqPort} = this.getPMHQHostPort()
    this.httpUrl = `http://${pmhqHost}:${pmhqPort}/`
    this.wsUrl = `ws://${pmhqHost}:${pmhqPort}/ws`
    this.connectWebSocket().then()
  }

  private getPMHQHostPort() {
    let pmhqPort = '13000'
    let pmhqHost: string = '127.0.0.1'
    for(const pArg of process.argv) {
      if (pArg.startsWith('--pmhq-port=')) {
        pmhqPort = pArg.replace('--pmhq-port=', '')
      }
      else if (pArg.startsWith('--pmhq-host=')) {
        pmhqHost = pArg.replace('--pmhq-host=', '')
      }
    }
    return {pmhqPort, pmhqHost}
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
      }
      this.reconnectTimer = setTimeout(() => {
        this.connectWebSocket()
      }, 999)
    }
    try {
      this.ws = new WebSocket(this.wsUrl)
    } catch (e) {
      return reconnect()
    }
    this.ws.onmessage = async event => {
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
      // console.info('PMHQ收到数据', data)
    }

    this.ws.onerror = (error) => {
      console.error('PMHQ WebSocket 连接错误', '正在重连...')
      reconnect()
    }

    this.ws.onclose = reconnect

    this.ws.onopen = ()=>{
      console.info('PMHQ WebSocket 连接成功')
    }
  }

  public async call(func: string, args: any) {
    const payload: PMHQReqCall = {
      type: 'call',
      data: {
        func,
        args,
      },
    }
    const result = ((await this.wsSend(payload)) as PMHQResCall).data?.result
    return result
  }

  public async waitConnected() {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN)) {
          resolve(true)
        }
        else {
          // console.log('recheck')
          setTimeout(check, 1000)
        }
      }
      check()
    })
  }

  public async wsSend<R extends PMHQRes>(data: PMHQReq): Promise<R> {
    await this.waitConnected()
    let echo = data.data?.echo
    if (!data.data?.echo) {
      echo = randomUUID()
      data.data.echo = echo
    }
    const payload = JSON.stringify(deepStringifyMap(data))
    const p = new Promise<R>((resolve, reject) => {
      const listenerId = this.addResListener<R>((res => {
        if (!res.data) {
          console.error(`PMHQ WS send error: payload ${data}, response ${res}`)
        }
        if (res.data?.echo == echo) {
          resolve(res)
          this.removeResListener(listenerId)
        }
      }))
    })
    this.ws!.send(payload)
    return p
  }

  public async httpSend<R extends PMHQRes>(data: PMHQReq): Promise<R> {
    const payload = JSON.stringify(deepStringifyMap(data))
    const response = await fetch(this.httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    })
    // this.ctx.logger.info(`pmhq payload ${payload}`)

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`PMHQ请求失败，请检查发包器PMHQ设置 ${response.status} - ${errorBody}`)
    }

    let result = await response.json()
    result = deepConvertMap(result)
    return result
  }

  private async httpSendPB(cmd: string, pb: Uint8Array): Promise<PBData> {
    return (await this.httpSend<PMHQResSendPB>({
      type: 'send',
      data: {
        cmd,
        pb: Buffer.from(pb).toString('hex'),
      },
    })).data
  }

  private async wsSendPB(cmd: string, pb: Uint8Array): Promise<PBData> {
    return (await this.wsSend<PMHQResSendPB>({
      type: 'send',
      data: {
        cmd,
        pb: Buffer.from(pb).toString('hex'),
      },
    })).data
  }

  async sendFriendPoke(uin: number) {
    const body = Oidb.SendPoke.encode({
      toUin: uin,
      friendUin: uin,
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xed3,
      subCommand: 1,
      body,
    }).finish()
    return await this.wsSendPB('OidbSvcTrpcTcp.0xed3_1', data)
  }

  async sendGroupPoke(groupCode: number, memberUin: number) {
    const body = Oidb.SendPoke.encode({
      toUin: memberUin,
      groupCode,
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xed3,
      subCommand: 1,
      body,
    }).finish()
    return await this.wsSendPB('OidbSvcTrpcTcp.0xed3_1', data)
  }

  async setSpecialTitle(groupCode: number, memberUid: string, title: string) {
    const body = Oidb.SetSpecialTitle.encode({
      groupCode,
      body: {
        targetUid: memberUid,
        uidName: title,
        specialTitle: title,
        expireTime: -1,
      },
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x8fc,
      subCommand: 2,
      body,
    }).finish()
    return await this.httpSendPB('OidbSvcTrpcTcp.0x8fc_2', data)
  }

  async getRKey() {
    const hexStr = '08e7a00210ca01221c0a130a05080110ca011206a80602b006011a02080122050a030a1400'
    const data = Buffer.from(hexStr, 'hex')
    const resp = await this.wsSendPB('OidbSvcTrpcTcp.0xed3_1', data)
    const rkeyBody = Oidb.Base.decode(Buffer.from(resp.pb, 'hex')).body
    const rkeyItems = Oidb.GetRKeyResponseBody.decode(rkeyBody).result?.rkeyItems!
    return {
      privateRKey: rkeyItems[0]?.rkey,
      groupRKey: rkeyItems[1]?.rkey,
    }
  }
}

export const pmhq = new PMHQ()
