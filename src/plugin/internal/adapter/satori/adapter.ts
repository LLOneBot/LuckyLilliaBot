import * as Universal from '@satorijs/protocol'
import { Service, Context } from 'cordis'
import type { Bot } from '@luckylillia/plugin-sdk'
import { SatoriConfig } from '@/common/types'
import { SatoriServer } from './server'
import { featuresOf, toWire, wirePlatform } from './wire'
import { ObjectToSnake } from 'ts-case-convert'

declare module 'cordis' {
  interface Context {
    satori: SatoriAdapter
  }
}

type WireEvent = ObjectToSnake<Universal.Event> & { id: number }

/**
 * The bots of the neutral layer (ctx.bots), every one of them, as Satori logins: events from bot/session, API calls
 * to the bot's own methods. Nothing here knows a platform beyond the names clients see (wire.ts).
 */
class SatoriAdapter extends Service {
  static inject = ['bots']
  private server: SatoriServer
  // Event and login numbers are the adapter's: each bot counts its own events from 1
  private eventSn = 0
  private loginSns = new Map<string, number>()

  constructor(public ctx: Context, public config: SatoriAdapter.Config) {
    super(ctx, 'satori')
    this.server = new SatoriServer(ctx, config, this)
  }

  async [Service.init]() {
    if (!this.config.enable) return
    this.server.start()
    // bot/session is the tap that plugin middleware cannot swallow, so Satori clients see everything, like OneBot ones
    this.ctx.on('bot/session', (session) => {
      this.dispatch(session.bot, toWire(session.event, session.bot.platform) as unknown as WireEvent)
    })
    this.ctx.on('bot/status', (bot) => {
      const type = this.loginSns.has(bot.sid) ? 'login-updated' : 'login-added'
      this.dispatch(bot, { type, self_id: bot.selfId, platform: wirePlatform(bot.platform), timestamp: Date.now(), login: this.login(bot) } as WireEvent)
    })
    return () => this.server.stop()
  }

  private loginSn(bot: Bot): number {
    let sn = this.loginSns.get(bot.sid)
    if (sn === undefined) this.loginSns.set(bot.sid, sn = this.loginSns.size + 1)
    return sn
  }

  /** The whole login, for READY and login.get. */
  login(bot: Bot): ObjectToSnake<Universal.Login> {
    return {
      sn: this.loginSn(bot),
      adapter: wirePlatform(bot.platform),
      platform: wirePlatform(bot.platform),
      user: toWire(bot.user ?? { id: bot.selfId }, bot.platform),
      status: bot.status,
      features: featuresOf(bot),
      proxy_urls: [],
    } as unknown as ObjectToSnake<Universal.Login>
  }

  private dispatch(bot: Bot, event: WireEvent) {
    const sn = ++this.eventSn
    // Events other than the login ones only carry sn, user and platform of the login; id is what the adapter has
    // always sent alongside sn
    const login = event.type.startsWith('login-')
      ? event.login
      : { sn: this.loginSn(bot), user: toWire(bot.user ?? { id: bot.selfId }, bot.platform), platform: wirePlatform(bot.platform) }
    this.server.dispatch({ ...event, id: sn, sn, login } as WireEvent)
  }
}

namespace SatoriAdapter {
  export interface Config extends SatoriConfig {}
}

export default SatoriAdapter
