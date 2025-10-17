import { Action, Msg, Oidb, RichMedia } from '@/ntqqapi/proto/compiled'
import { deepConvertMap, deepStringifyMap } from '@/ntqqapi/native/pmhq/util'
import { Peer, ChatType } from '@/ntqqapi/types/msg'
import { selfInfo } from '@/common/globalVars'
import { randomBytes, randomUUID } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

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

interface PMHQReqTellPort {
  type: 'tell_port',
  data: {
    echo?: string
    webui_port: number
  }
}

interface PMHQResTellPort {
  type: 'tell_port',
  data: {
    echo?: string
    success: boolean
  }
}


export type PMHQRes = PMHQResSendPB | PMHQResRecvPB | PMHQResOn | PMHQResCall | PMHQResTellPort

export type PMHQReq = PMHQReqSendPB | PMHQReqCall | PMHQReqTellPort

interface ResListener<R extends PMHQRes> {
  (data: R): void
}

interface MultiMsgItem {
  fileName: string
  buffer: {
    msg: Msg.Message[]
  }
}

export class PMHQ {
  private reconnectTimer: NodeJS.Timeout | undefined
  private httpUrl: string = 'http://127.0.0.1:13000'
  private wsUrl: string = 'ws://127.0.0.1:13000/ws'
  private ws: WebSocket | undefined
  private resListeners: Map<string, ResListener<any>> = new Map()

  constructor() {
    console.log(process.argv)
    const { pmhqHost, pmhqPort } = this.getPMHQHostPort()
    this.httpUrl = `http://${pmhqHost}:${pmhqPort}/`
    this.wsUrl = `ws://${pmhqHost}:${pmhqPort}/ws`
    this.connectWebSocket().then()
  }

  public get_is_connected() {
    return this.ws && (this.ws.readyState === WebSocket.OPEN)
  }

  private getPMHQHostPort() {
    let pmhqPort = '13000'
    let pmhqHost: string = '127.0.0.1'
    for (const pArg of process.argv) {
      if (pArg.startsWith('--pmhq-port=')) {
        pmhqPort = pArg.replace('--pmhq-port=', '')
      }
      else if (pArg.startsWith('--pmhq-host=')) {
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
      selfInfo.online = false
      console.error('PMHQ WebSocket 连接错误，可能 QQ 未启动', '正在等待 QQ 启动进行重连...')
      reconnect()
    }

    this.ws.onclose = () => {
      selfInfo.online = false
      console.info('PMHQ WebSocket 连接关闭，准备重连...')
      reconnect()
    }

    this.ws.onopen = () => {
      // selfInfo.online = true
      console.info('PMHQ WebSocket 连接成功')
    }
  }

  public async call(func: string, args: any, timeout = 10000): Promise<any> {
    const payload: PMHQReqCall = {
      type: 'call',
      data: {
        func,
        args,
      },
    }
    const result = ((await this.wsSend(payload, timeout)) as PMHQResCall).data?.result
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

  public async tellPort(webuiPort: number) {
    const payload: PMHQReqTellPort = {
      type: 'tell_port',
      data: {
        webui_port: webuiPort,
      },
    }
    const result = ((await this.wsSend(payload, 5000)) as PMHQResTellPort).data?.success
    return result
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
      const listenerId = this.addResListener<R>((res => {
        if (!res.data) {
          console.error(`PMHQ WS send error: payload ${data}, response ${res}`)
        }
        if (res.data?.echo == echo) {
          resolve(res)
          clearTimeout(timeoutId)
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

  async sendPB(cmd: string, hex: string): Promise<PBData> {
    return (await this.wsSend<PMHQResSendPB>({
      type: 'send',
      data: {
        cmd,
        pb: hex,
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
    const resp = await this.wsSendPB('OidbSvcTrpcTcp.0x9067_202', data)
    const rkeyBody = Oidb.Base.decode(Buffer.from(resp.pb, 'hex')).body
    const rkeyItems = Oidb.GetRKeyResponseBody.decode(rkeyBody).result!.rkeyItems!
    return {
      privateRKey: rkeyItems[0].rkey!,
      groupRKey: rkeyItems[1].rkey!,
      expiredTime: rkeyItems[0].createTime! + rkeyItems[0].ttlSec!
    }
  }

  async uploadForward(peer: Peer, items: Msg.PbMultiMsgItem[]) {
    const transmit = Msg.PbMultiMsgTransmit.encode({ pbItemList: items }).finish()
    const isGroup = peer.chatType === ChatType.Group
    const data = Action.SendLongMsgReq.encode({
      info: {
        type: isGroup ? 3 : 1,
        peer: {
          uid: isGroup ? peer.peerUid : selfInfo.uid
        },
        groupCode: isGroup ? +peer.peerUid : 0,
        payload: gzipSync(transmit)
      },
      settings: {
        field1: 4,
        field2: 1,
        field3: 7,
        field4: 0
      }
    }).finish()
    const res = await this.httpSendPB('trpc.group.long_msg_interface.MsgService.SsoSendLongMsg', data)
    return Action.SendLongMsgResp.decode(Buffer.from(res.pb, 'hex')).result!.resId!
  }

  async pullPics(word: string) {
    const data = Action.PullPicsReq.encode({
      uin: +selfInfo.uin,
      field3: 1,
      word,
      word2: word,
      field8: 0,
      field9: 0,
      field14: 1
    }).finish()
    const res = await this.httpSendPB('PicSearchSvr.PullPics', data)
    return Action.PullPicsResp.decode(Buffer.from(res.pb, 'hex'))
  }

  async fetchUserLevel(uin: number) {
    const body = Oidb.FetchUserInfo.encode({
      uin,
      keys: [{ key: 105 }],
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xfe1,
      subCommand: 2,
      body,
      isReserved: 1,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0xfe1_2', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    const info = Oidb.FetchUserInfoResponse.decode(oidbRespBody)
    return info.body!.properties!.numberProperties![0].value!
  }

  async fetchAiCharacterList(groupId: number, chatType: number) {
    const body = Oidb.FetchAiCharacterList.encode({
      groupId,
      chatType,
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x929d,
      subCommand: 0,
      body,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0x929d_0', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    return Oidb.FetchAiCharacterListResponse.decode(oidbRespBody)
  }

  async getGroupGenerateAiRecord(groupId: number, character: string, text: string, chatType: number) {
    const body = Oidb.GetGroupGenerateAiRecord.encode({
      groupId,
      voiceId: character,
      text,
      chatType,
      clientMsgInfo: {
        msgRandom: randomBytes(4).readUInt32BE(0)
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x929b,
      subCommand: 0,
      body,
    }).finish()
    await this.httpSendPB('OidbSvcTrpcTcp.0x929b_0', data)
  }

  async getC2cPttUrl(fileUuid: string) {
    const body = RichMedia.NTV2RichMediaReq.encode({
      reqHead: {
        common: {
          requestId: 1,
          command: 200,
        },
        scene: {
          requestType: 1,
          businessType: 3,
          field103: 0,
          sceneType: 1,
          c2c: {
            accountType: 2,
            targetUid: selfInfo.uid,
          }
        },
        client: {
          agentType: 2
        }
      },
      download: {
        node: {
          fileUuid,
          storeID: 1,
          uploadTime: 0,
          expire: 0,
          type: 0
        }
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x126d,
      subCommand: 200,
      body,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0x126d_200', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    const { download } = RichMedia.NTV2RichMediaResp.decode(oidbRespBody)
    return `https://${download?.info?.domain}${download?.info?.urlPath}${download?.rKeyParam}` // 获取到的是 AMR 音频，并非 SILK
  }

  async getMultiMsg(resId: string) {
    const data = Action.RecvLongMsgReq.encode({
      info: {
        peer: {
          uid: selfInfo.uid
        },
        resId,
        acquire: true
      },
      settings: {
        field1: 2,
        field2: 0,
        field3: 0,
        field4: 0
      }
    }).finish()
    const res = await this.httpSendPB('trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg', data)
    const payload = Action.RecvLongMsgResp.decode(Buffer.from(res.pb, 'hex')).result?.payload
    const inflate = gunzipSync(payload!)
    return Msg.PbMultiMsgTransmit.decode(inflate).pbItemList
  }

  async getGroupImageUrl(groupId: number, node: RichMedia.IndexNode) {
    const body = RichMedia.NTV2RichMediaReq.encode({
      reqHead: {
        common: {
          requestId: 1,
          command: 200
        },
        scene: {
          requestType: 2,
          businessType: 1,
          sceneType: 2,
          group: {
            groupId
          }
        },
        client: {
          agentType: 2,
        }
      },
      download: {
        node
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x11c4,
      subCommand: 200,
      body,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11c4_200', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    const { download } = RichMedia.NTV2RichMediaResp.decode(oidbRespBody)
    return `https://${download?.info?.domain}${download?.info?.urlPath}${download?.rKeyParam}`
  }

  async getC2cImageUrl(node: RichMedia.IndexNode) {
    const body = RichMedia.NTV2RichMediaReq.encode({
      reqHead: {
        common: {
          requestId: 1,
          command: 200
        },
        scene: {
          requestType: 2,
          businessType: 1,
          sceneType: 1,
          c2c: {
            accountType: 2,
            targetUid: selfInfo.uid
          },
        },
        client: {
          agentType: 2,
        }
      },
      download: {
        node
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x11c5,
      subCommand: 200,
      body,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11c5_200', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    const { download } = RichMedia.NTV2RichMediaResp.decode(oidbRespBody)
    return `https://${download?.info?.domain}${download?.info?.urlPath}${download?.rKeyParam}`
  }

  async getGroupFileUrl(groupCode: number, fileId: string) {
    const body = Oidb.GroupFile.encode({
      download: {
        groupCode,
        appId: 7,
        busId: 102,
        fileId
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x6d6,
      subCommand: 2,
      body,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0x6d6_2', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    const { download } = Oidb.GroupFileResponse.decode(oidbRespBody)
    return `https://${download?.downloadDns}/ftn_handler/${Buffer.from(download!.downloadUrl!).toString('hex')}/?fname=`
  }

  async getPrivateFileUrl(receiverUid: string, fileUuid: string) {
    const body = Oidb.PrivateFile.encode({
      subCommand: 1200,
      field2: 1,
      body: {
        receiverUid,
        fileUuid,
        type: 2,
        t2: 0
      },
      field101: 3,
      field102: 103,
      field200: 1,
      field99999: Buffer.from([0xc0, 0x85, 0x2c, 0x01])
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xe37,
      subCommand: 1200,
      body,
    }).finish()
    const res = await this.httpSendPB('OidbSvcTrpcTcp.0xe37_1200', data)
    const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
    const file = Oidb.PrivateFileResponse.decode(oidbRespBody)
    const { download } = file.body!.result!.extra!
    const { fileName } = file.body!.metadata!
    return `https://${download?.downloadDns}/ftn_handler/${Buffer.from(download!.downloadUrl!).toString('hex')}/?fname=${encodeURIComponent(fileName!)}`
  }

  async groupClockIn(groupCode: string) {
    const body = Oidb.GroupClockIn.encode({
      body: {
        uin: selfInfo.uin,
        groupCode
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xeb7,
      subCommand: 1,
      body,
    }).finish()
    await this.httpSendPB('OidbSvcTrpcTcp.0xeb7_1', data)
  }

  async fetchUserLoginDays(uin: number) {
    const body = Action.FetchUserLoginDays.encode({
      field2: 0,
      json: JSON.stringify({
        msg_req_basic_info: {
          uint64_request_uin: [uin]
        },
        uint32_req_login_info: 1
      })
    }).finish()
    const res = await this.httpSendPB('MQUpdateSvc_com_qq_ti.web.OidbSvc.0xdef_1', body)
    const { json } = Action.FetchUserLoginDaysResp.decode(Buffer.from(res.pb, 'hex'))
    return JSON.parse(json).msg_rsp_basic_info.rpt_msg_basic_info[1].uint32_login_days
  }
}

export const pmhq = new PMHQ()
