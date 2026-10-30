import h from '@satorijs/element'
import { Context, Service } from 'cordis'
import type { Bot, Bots, NeutralEvent } from '@luckylillia/plugin-sdk'
import { applyFallbacks } from './fallback'
import { Session } from './session'

/**
 * `ctx.bots`. Accessed through ctx, cordis runs these methods with `this.ctx` set to the caller's
 * context, so register() ties the bot to the calling plugin. Mutate fields, never reassign them:
 * the call runs on a shadow of the instance.
 */
class BotsService extends Service implements Bots {
  private registry = new Map<string, Bot>()

  constructor(ctx: Context) {
    super(ctx, 'bots')
  }

  get size() {
    return this.registry.size
  }

  get(sid: string) {
    return this.registry.get(sid)
  }

  [Symbol.iterator]() {
    return this.registry.values()
  }

  register(bot: Bot): () => void {
    const ctx = this.ctx
    return ctx.effect(() => {
      if (this.registry.has(bot.sid)) throw new Error(`bot ${bot.sid} is already registered`)
      this.registry.set(bot.sid, bot)
      ctx.parallel('bot/status', bot).catch(e => ctx.logger('bots').warn(e))
      return () => {
        this.registry.delete(bot.sid)
      }
    }, `bots.register(${bot.sid})`)
  }

  async dispatch(bot: Bot, event: NeutralEvent): Promise<void> {
    const session = new Session(bot, event)
    const ctx = this.ctx
    // A failing transport must not keep the event from the plugins, nor the other way round
    const tap = ctx.parallel('bot/session', session).catch(e => ctx.logger('bots').warn(e))
    // Middleware only sees what it could answer; the bot's own messages would invite reply loops
    if (event.type === 'message-created' && session.userId !== session.selfId) {
      await ctx.waterfall('bot/message', session, async () => {})
    } else {
      await ctx.parallel('bot/event', session)
    }
    await tap
  }

  async beforeSend(bot: Bot, channelId: string, content: h[]): Promise<h[]> {
    const outgoing = await this.ctx.waterfall('bot/before-send', bot, channelId, content, async () => content)
    // After the rewrites, which may bring extension elements of their own
    return await applyFallbacks(this.ctx, bot, channelId, outgoing)
  }
}

export default BotsService
