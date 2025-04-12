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

  constructor(private ctx: Context, port?: number) {
    if (port) {
      this.activated = true
      ctx.on('ready', () => {
        this.connect(port)
      })
    }
  }

  private send(cmd: string, pb: Uint8Array) {
    return new Promise<Data>(async (resolve, reject) => {
      if (!this.connected) {
        reject(new Error('发包器未连接'))
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
    this.ws = new WebSocket(`ws://localhost:${port}/ws`)
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
      setTimeout(() => {
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
}
