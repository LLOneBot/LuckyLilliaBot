import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'echo'
export const inject = ['bots']

export interface Config {
  prefix: string
}

export const Config: Schema<Config> = Schema.object({
  prefix: Schema.string().default('echo ').description('触发前缀'),
})

export function apply(ctx: Context, config: Config) {
  ctx.on('bot/message', async (session, next) => {
    // "@bot echo hi" counts too: the QQ official bot only sees group messages that mention it
    const { content } = session.stripped
    if (!content.startsWith(config.prefix)) return next()
    const text = content.slice(config.prefix.length)
    if (text) await session.reply(text)
  })
}
