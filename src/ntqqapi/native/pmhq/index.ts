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

interface ResListener {
  (data: PMHQRes): void
}

export class PMHQ {
  private reconnectTimer: NodeJS.Timeout | undefined
  private httpUrl: string = 'http://127.0.0.1:13000'
  private wsUrl: string = 'ws://127.0.0.1:13000/ws'
  private ws: WebSocket | undefined
  private resListeners: Map<string, ResListener> = new Map()

  constructor() {
    let pmhqAddrPath: string
    let pmhqDataDir
    if (process.platform === 'win32') {
      pmhqDataDir = path.join(os.homedir(), 'APPDATA/Local/pmhq')
    }
    else {
      pmhqDataDir = path.join(os.homedir(), '.pmhq')
    }
    pmhqAddrPath = path.join(pmhqDataDir, `PMHQ_ADDR_LAST.txt`)
    let pmhqAddr = '127.0.0.1:13300'
    try {
      pmhqAddr = fs.readFileSync(pmhqAddrPath, 'utf-8')
    } catch (err) {
      console.error('PMHQ地址文件读取失败，使用默认地址')
      console.info('PMHQ address:' + pmhqAddr)
    }
    const port = pmhqAddr.split(':')[1]
    this.httpUrl = `http://127.0.0.1:${port}/`
    this.wsUrl = `ws://127.0.0.1:${port}/ws`
    this.connectWebSocket()
  }

  public addResListener(listener: ResListener) {
    const listenerId = randomUUID()
    this.resListeners.set(listenerId, listener)
    return listenerId
  }

  public removeResListener(listenerId: string) {
    this.resListeners.delete(listenerId)
  }

  private connectWebSocket() {
    this.ws = new WebSocket(this.wsUrl)
    this.ws.onmessage = (event => {
      let data: PMHQRes = JSON.parse(event.data.toString())
      data = deepConvertMap(data)
      for (const func of this.resListeners.values()) {
        func(data)
      }
      // console.info('PMHQ收到数据', data)
    })
    this.ws.onerror = (error) => {
      console.error('PMHQ WebSocket 连接错误', error)
      this.ws = undefined
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
      }
      this.reconnectTimer = setTimeout(() => {
        this.connectWebSocket()
      }, 5000)
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
    return ((await this.wsSend(payload)) as PMHQResCall).data.result
  }

  public async wsSend(data: PMHQReq) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('PMHQ WebSocket 未连接或已断开，请检查 PMHQ 设置')
    }
    const echo = randomUUID()
    data.data.echo = echo
    const payload = JSON.stringify(deepStringifyMap(data))
    const p = new Promise<PMHQRes>((resolve, reject) => {
      const listenerId = this.addResListener((res => {
        if (!res.data) {
          console.error(data)
        }
        if (res.data?.echo == echo) {
          resolve(res)
          this.removeResListener(listenerId)
        }
      }))
    })
    this.ws.send(payload)
    return p
  }

  public async httpSend(data: PMHQReq) {
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
    return result.data
  }

  private async httpSendPB(cmd: string, pb: Uint8Array) {
    return this.httpSend({
      type: 'send',
      data: {
        cmd,
        pb: Buffer.from(pb).toString('hex'),
      },
    })
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
    return await this.httpSendPB('OidbSvcTrpcTcp.0xed3_1', data)
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
    return await this.httpSendPB('OidbSvcTrpcTcp.0xed3_1', data)
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
    const resp = await this.httpSendPB('OidbSvcTrpcTcp.0xed3_1', data)
    const rkeyBody = Oidb.Base.decode(Buffer.from(resp.pb, 'hex')).body
    const rkeyItems = Oidb.GetRKeyResponseBody.decode(rkeyBody).result?.rkeyItems!
    return {
      privateRKey: rkeyItems[0]?.rkey,
      groupRKey: rkeyItems[1]?.rkey,
    }
  }
}

export const pmhq = new PMHQ()
