import { noop, omit } from 'cosmokit'
import { Event } from '@satorijs/protocol'
import { Service, Context } from 'cordis'
import { SatoriConfig } from '@/common/types'
import { SatoriServer } from './server'
import { ObjectToSnake } from 'ts-case-convert'
import { isDeepStrictEqual } from 'node:util'

declare module 'cordis' {
  interface Context {
    satori: SatoriAdapter
  }
}

class SatoriAdapter extends Service {
  static inject = [
    'ntMsgApi', 'ntFileApi', 'ntFriendApi',
    'ntGroupApi', 'ntUserApi', 'ntWebApi',
    'store', 'app', 'bots'
  ]
  private server: SatoriServer
  public _loginSeq: number
  private listenedEvent = false

  constructor(public ctx: Context, public config: SatoriAdapter.Config) {
    super(ctx, 'satori')
    this.server = new SatoriServer(ctx, config)
    this._loginSeq = 1
  }

  async [Service.init]() {
    this.start()
    return noop
  }

  start() {
    this.ctx.on('llob/config-updated', async input => {
      const old = omit(this.config, ['ffmpeg'])
      const inputSatoriConfig = input.satori
      if (!isDeepStrictEqual(old, inputSatoriConfig)) {
        await this.server.stop()
        this.server.updateConfig(inputSatoriConfig)
        if (inputSatoriConfig.enable) {
          this.server.start()
          this.listenEvent()
        }
      }
      Object.assign(this.config, { ...inputSatoriConfig, ffmpeg: input.ffmpeg })
    })
    if (this.config.enable) {
      this.server.start()
    } else {
      return
    }
    this.listenEvent()
  }

  listenEvent() {
    if (this.listenedEvent) return
    this.listenedEvent = true

    // The neutral layer already holds every NT event as a Satori event. bot/session is the tap that
    // plugin middleware cannot swallow, so Satori clients keep seeing everything, like OneBot ones.
    this.ctx.on('bot/session', (session) => {
      if (session.bot.platform !== 'llonebot') return
      this.server.dispatch(session.event as ObjectToSnake<Event>)
    })
  }
}

namespace SatoriAdapter {
  export interface Config extends SatoriConfig {
    ffmpeg?: string
  }
}

export default SatoriAdapter
