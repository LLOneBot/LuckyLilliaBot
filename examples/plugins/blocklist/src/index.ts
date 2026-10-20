import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'blocklist'
export const inject = ['bots']

export interface Config {
  users: string[]
}

export const Config: Schema<Config> = Schema.object({
  users: Schema.array(String).role('table').default([]).description('屏蔽的用户 ID'),
})

export function apply(ctx: Context, config: Config) {
  // prepend: run ahead of other middleware whatever order the plugins were enabled in
  ctx.on('bot/message', (session, next) => {
    if (session.userId && config.users.includes(session.userId)) return
    return next()
  }, { prepend: true })
}
