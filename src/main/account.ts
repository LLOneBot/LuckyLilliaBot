import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'

declare module 'cordis' {
  interface Context {
    account: AccountService
  }
  interface Events {
    /**
     * @mode emit. Fires once, just before `account` becomes available, so config consumers can switch to
     * this account's files (and apply its override layers) before anything injecting `account` starts.
     */
    'account/prepare'(uin: string): void
  }
}

/**
 * The logged-in account. Plugins that inject it stay pending until the first qq/online and are not
 * taken down by later disconnects, so upper layers ride out short network drops.
 */
class AccountService extends Service {
  uin = ''
  uid = ''
  nick = ''
  private online = false

  constructor(ctx: Context) {
    super(ctx, 'account')
  }

  // cordis re-evaluates this on reflect.notify(); dependents only see the service once it holds
  [Service.check]() {
    return this.online
  }

  async [Service.init]() {
    // The protocol layer may have announced qq/online before this service came up
    if (selfInfo.online && selfInfo.uid) this.markOnline()
    return this.ctx.on('qq/online', () => this.markOnline())
  }

  private markOnline() {
    if (this.online) return
    this.uin = selfInfo.uin
    this.uid = selfInfo.uid
    this.nick = selfInfo.nick
    this.online = true
    // Announced before notify() so per-account config is picked up ahead of the dependents starting
    this.ctx.emit('account/prepare', this.uin)
    this.ctx.reflect.notify(['account'])
  }
}

export default AccountService
