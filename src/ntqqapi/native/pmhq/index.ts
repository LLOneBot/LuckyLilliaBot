import { Context } from 'cordis'
import { WebSocket } from 'ws'
import { Oidb } from '@/ntqqapi/proto/compiled'

interface Data {
  echo: string
  cmd: string
  pb: string
}

export class Pmhq {
  public activated = false
  private ws?: WebSocket
  private seq = 0
  private cb: Map<string, (data: Data) => void> = new Map()
  private connected = false
  private reconnectTimer: NodeJS.Timeout | undefined

  constructor(private ctx: Context, port?: number) {
    if (port) {
      ctx.on('ready', () => {
        this.start(port)
      })
    }
  }

  public start(port: number){
    this.activated = true
    this.connect(port)
  }

  public stop(){
    if (this.activated){
      this.activated = false
      if (this.ws) {
        if(this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this.ws.onclose = null
        this.ws.close()
      }
    }
  }

  private send(cmd: string, pb: Uint8Array) {
    return new Promise<Data>(async (resolve, reject) => {
      if (!this.connected) {
        reject(new Error('发包器未连接，请前往LLOneBot设置页面配置'))
      }
      const echo = String(++this.seq)
      this.cb.set(echo, (data: Data) => {
        this.cb.delete(echo)
        resolve(data)
      })
      setTimeout(() => {
        this.cb.delete(echo)
        reject(new Error('发包超时'))
      }, 5000)
      this.ws!.send(JSON.stringify({
        type: 'send',
        data: {
          echo,
          cmd,
          pb: Buffer.from(pb).toString('hex')
        } as Data
      }))
    })
  }

  private async connect(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    this.ws.on('open', () => {
      this.connected = true
      this.ws!.addEventListener('message', ({ data }) => {
        let parsed: { type: 'recv', data: Data }
        data = data.toString()
        try {
          parsed = JSON.parse(data)
        } catch (error) {
          return this.ctx.logger.warn('cannot parse message', data)
        }

        if (this.cb.has(parsed.data.echo)) {
          this.cb.get(parsed.data.echo)?.(parsed.data)
        }
      })
    })
    this.ws.on('error', (e) => {
      this.ctx.logger.warn('发包器连接失败', e)
    })
    this.ws.on('close', () => {
      this.connected = false
      this.reconnectTimer = setTimeout(() => {
        this.connect(port)
      }, 5000)
    })
  }

  async sendFriendPoke(uin: number) {
    const body = Oidb.SendPoke.encode({
      toUin: uin,
      friendUin: uin
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xed3,
      subCommand: 1,
      body
    }).finish()
    return await this.send('OidbSvcTrpcTcp.0xed3_1', data)
  }

  async sendGroupPoke(groupCode: number, memberUin: number) {
    const body = Oidb.SendPoke.encode({
      toUin: memberUin,
      groupCode
    }).finish()
    const data = Oidb.Base.encode({
      command: 0xed3,
      subCommand: 1,
      body
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
        expireTime: -1
      }
    }).finish()
    const data = Oidb.Base.encode({
      command: 0x8fc,
      subCommand: 2,
      body
    }).finish()
    return await this.send('OidbSvcTrpcTcp.0x8fc_2', data)
  }

  async getRKey(){
    const hexStr = '08e7a00210ca01221c0a130a05080110ca011206a80602b006011a02080122050a030a1400'
    const data = new Uint8Array(Buffer.from(hexStr, 'hex'));
    const resp = await this.send('OidbSvcTrpcTcp.0xed3_1', data)
    const respProtobuf = resp.pb
    const rkeyBody = Oidb.Base.decode(new Uint8Array(Buffer.from(respProtobuf, 'hex'))).body
    const rkeyItems =  Oidb.GetRKeyResponseBody.decode(rkeyBody).result?.rkeyItems!
    return {
      privateRKey: rkeyItems[0]?.rkey,
      groupRKey: rkeyItems[1]?.rkey
    }
  }
}
