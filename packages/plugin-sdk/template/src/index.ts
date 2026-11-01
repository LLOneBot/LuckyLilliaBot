import { Context, h, Schema } from '@luckylillia/plugin-sdk'

export const name = '{{id}}'
// Services the plugin needs: it runs once they are all there. Keep llbot.service.required in package.json the same
export const inject = ['bots', 'commands']

export interface Config {
  greeting: string
}

// The WebUI makes a form of it
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('你好').description('打招呼用的话'),
})

export function apply(ctx: Context, config: Config) {
  // A command: "/hello" or "hello", with an optional name after it
  ctx.command('hello [name:text]', '打个招呼').action(({ session }, name?: string) => {
    return `${config.greeting}，${name || session.event.user?.name || session.userId}！`
  })

  // Every message from others passes here; call next() to let the plugins after this one see it too
  ctx.on('bot/message', async (session, next) => {
    if (session.stripped.content !== 'ping') return next()
    await session.send(h('markdown', {}, '**pong**'))
  })
}
