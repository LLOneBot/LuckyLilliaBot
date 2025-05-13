import { Context } from 'cordis'
import { WebSocket } from 'ws'
import { Oidb } from '@/ntqqapi/proto/compiled'
import { selfInfo } from '@/common/globalVars'
import { Field } from 'minato'
import string = Field.string
import path from 'node:path'
import * as os from 'node:os'
import fs from 'node:fs'

interface Data {
  echo: string
  cmd: string
  pb: string
}

export class Pmhq {
  private reconnectTimer: NodeJS.Timeout | undefined
  private url: string = 'http://127.0.0.1:13000'

  constructor(private ctx: Context) {
    let pmhqAddrPath: string
    let pmhqDataDir
    if (process.platform === 'win32') {
      pmhqDataDir = path.join(process.env['LOCALAPPDATA']!!, 'pmhq')
    }
    else {
      pmhqDataDir = path.join(os.homedir(), '.pmhq')
    }
    pmhqAddrPath = path.join(pmhqDataDir, `PMHQ_ADDR_${selfInfo.uin}.txt`)
    fs.readFile(pmhqAddrPath, (err, data)=> {
      let pmhqAddr = '127.0.0.1:13000'
      if (err) {
        ctx.logger.error('PMHQ地址文件读取失败，使用默认地址')
      }
      ctx.logger.info('PMHQ address:' + pmhqAddr)
      this.url = 'http://' + pmhqAddr + '/'
    })
  }


  private async send(cmd: string, pb: Uint8Array) {
    const payload = JSON.stringify({
      type: 'send',
      data: {
        cmd,
        pb: Buffer.from(pb).toString('hex'),
      } as Data,
    })
    const response = await fetch(this.url, {
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

    const result = await response.json()
    return result.data
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
    return await this.send('OidbSvcTrpcTcp.0xed3_1', data)
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
    return await this.send('OidbSvcTrpcTcp.0xed3_1', data)
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
    return await this.send('OidbSvcTrpcTcp.0x8fc_2', data)
  }

  async getRKey() {
    const hexStr = '08e7a00210ca01221c0a130a05080110ca011206a80602b006011a02080122050a030a1400'
    const data = Buffer.from(hexStr, 'hex')
    const resp = await this.send('OidbSvcTrpcTcp.0xed3_1', data)
    const rkeyBody = Oidb.Base.decode(Buffer.from(resp.pb, 'hex')).body
    const rkeyItems = Oidb.GetRKeyResponseBody.decode(rkeyBody).result?.rkeyItems!
    return {
      privateRKey: rkeyItems[0]?.rkey,
      groupRKey: rkeyItems[1]?.rkey,
    }
  }
}
