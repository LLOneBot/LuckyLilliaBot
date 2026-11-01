/**
 * `ctx.account`: the scanned QQ account (builtin:nt-protocol). Injecting `account` waits for its first login and
 * keeps a plugin up through reconnects; `online` says how it is right now. The QQ official bot is no account of this
 * kind: its bots are in `ctx.bots`.
 */
export interface Account {
  readonly uin: string
  readonly uid: string
  readonly nick: string
  readonly online: boolean
}

declare module 'cordis' {
  interface Context {
    account: Account
  }
}
