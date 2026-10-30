import { Context, Service } from 'cordis'
import type { SelfInfo } from './ntqqapi/types'

declare module 'cordis' {
  interface Context {
    account: AccountService
  }
}

/**
 * The logged-in account, as other plugins see it: the protocol's record of it (QQProtocolBase.selfInfo), which
 * nothing outside this plugin holds. Plugins that inject it stay pending until the first qq/online and are not
 * taken down by later disconnects, so upper layers ride out short network drops; `online` says how it is right now.
 */
class AccountService extends Service {
  static inject = ['qqProtocol']

  // Taken here: read through ctx.account, the getters run on the caller's context
  private readonly self: SelfInfo
  private loggedIn = false

  constructor(ctx: Context) {
    super(ctx, 'account')
    this.self = ctx.qqProtocol.selfInfo
  }

  get uin() {
    return this.self.uin
  }

  get uid() {
    return this.self.uid
  }

  get nick() {
    return this.self.nick
  }

  get online() {
    return this.self.online
  }

  // cordis re-evaluates this on reflect.notify(); dependents only see the service once it holds
  [Service.check]() {
    return this.loggedIn
  }

  async [Service.init]() {
    // The protocol layer may have announced qq/online before this service came up
    if (this.self.online && this.self.uid) this.markOnline()
    return this.ctx.on('qq/online', () => this.markOnline())
  }

  private markOnline() {
    if (this.loggedIn) return
    this.loggedIn = true
    this.ctx.reflect.notify(['account'])
  }
}

export default AccountService
