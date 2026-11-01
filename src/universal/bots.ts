import h from '@satorijs/element'
import { Context, Service } from 'cordis'
import type { Bot, Bots, NeutralEvent, NeutralResource, SendOptions } from '@luckylillia/plugin-sdk'
import { applyFallbacks } from './fallback'
import { Session } from './session'

/** Where an event came from or a message goes, as far as a plugin's scope goes. A Session is one. */
export interface Place {
  readonly platform: string
  readonly selfId: string
  readonly channelId?: string
  readonly guildId?: string
  readonly userId?: string
  readonly isDirect: boolean
}

/**
 * What the plugin host (PluginService) tells the neutral layer about the plugins' listeners: the entry a listener
 * belongs to, whether that entry takes events from a place, where its message listeners run, and where to note
 * what they threw. Without one every listener takes everything, in the order it was registered.
 */
export interface ListenerPolicy {
  owner(ctx: Context): string | undefined
  accepts(owner: string, place: Place): boolean
  /** Position among the message listeners; the unranked run after the ranked, in registration order. */
  rank(owner: string): number | undefined
  failed(owner: string, error: unknown): void
}

interface Hook {
  ctx: Context
  callback: (...args: any[]) => any
  global?: boolean
}

const PROMPT_TIMEOUT = 60_000
const QUEUE_DELAY = 1_000

const placeKey = (place: Place) => [place.platform, place.selfId, place.channelId, place.userId].join('\n')

/**
 * `ctx.bots`. Accessed through ctx, cordis runs these methods with `this.ctx` set to the caller's
 * context, so register() ties the bot to the calling plugin. Mutate fields, never reassign them:
 * the call runs on a shadow of the instance.
 */
class BotsService extends Service implements Bots {
  private registry = new Map<string, Bot>()
  private readonly state: { policy?: ListenerPolicy } = {}
  private prompts = new Map<string, (answer: Session | undefined) => void>()
  private queues = new Map<string, Promise<unknown>>()

  constructor(ctx: Context) {
    super(ctx, 'bots')
    ctx.effect(() => () => {
      for (const resolve of this.prompts.values()) resolve(undefined)
      this.prompts.clear()
    })
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

  /** For the plugin host: until the returned function runs, `policy` places every listener. */
  usePolicy(policy: ListenerPolicy): () => void {
    this.state.policy = policy
    return () => {
      if (this.state.policy === policy) this.state.policy = undefined
    }
  }

  /** The entry a context belongs to, by the policy; undefined for the bot's own code. */
  ownerOf(ctx: Context): string | undefined {
    return this.state.policy?.owner(ctx)
  }

  /** Notes against the plugin `ctx` belongs to that its code for an event threw, e.g. a command's action. */
  reportFailure(ctx: Context, error: unknown) {
    const owner = this.ownerOf(ctx)
    if (owner !== undefined) this.state.policy!.failed(owner, error)
  }

  /** Whether the plugin `ctx` belongs to takes events from `place`. */
  allows(ctx: Context, place: Place): boolean {
    const owner = this.ownerOf(ctx)
    return owner === undefined || this.state.policy!.accepts(owner, place)
  }

  async dispatch(bot: Bot, event: NeutralEvent): Promise<void> {
    const session = new Session(bot, event, this)
    // A failing transport must not keep the event from the plugins, nor the other way round
    const tap = this.fanOut('bot/session', session, [session])
    // Middleware only sees what it could answer; the bot's own messages would invite reply loops
    if (event.type === 'message-created' && session.userId !== session.selfId) {
      const waiting = this.prompts.get(placeKey(session))
      if (waiting) {
        this.prompts.delete(placeKey(session))
        waiting(session)
      } else {
        await this.chain('bot/message', session, [session], async () => {})
      }
    } else {
      await this.fanOut('bot/event', session, [session])
    }
    await tap
  }

  async beforeSend(bot: Bot, channelId: string, content: h[], options: SendOptions = {}): Promise<h[]> {
    // What a protocol client sends is not the plugins' to rewrite
    if (options.relay) return await applyFallbacks(this.ctx, bot, channelId, content, false)
    const place: Place = { platform: bot.platform, selfId: bot.selfId, channelId, isDirect: channelId.startsWith('private:') }
    const outgoing = await this.chain('bot/before-send', place, [bot, channelId, content], async () => content, false)
    // After the rewrites, which may bring extension elements of their own
    return await applyFallbacks(this.ctx, bot, channelId, outgoing)
  }

  /** The next message of the user in the session's channel, undefined after `timeout`; it skips the middleware. */
  prompt(session: Session, timeout = PROMPT_TIMEOUT): Promise<Session | undefined> {
    const key = placeKey(session)
    this.prompts.get(key)?.(undefined)
    return new Promise((resolve) => {
      const timer = setTimeout(() => settle(undefined), timeout)
      const settle = (answer: Session | undefined) => {
        clearTimeout(timer)
        if (this.prompts.get(key) === settle) this.prompts.delete(key)
        resolve(answer)
      }
      this.prompts.set(key, settle)
    })
  }

  /** Sends after what was queued for the channel before, then holds the queue for `delay`. */
  sendQueued(bot: Bot, channelId: string, content: h.Fragment, options?: SendOptions, delay = QUEUE_DELAY): Promise<NeutralResource[]> {
    const key = `${bot.sid}\n${channelId}`
    const sent = (this.queues.get(key) ?? Promise.resolve()).then(() => bot.sendMessage(channelId, content, options))
    const queue = sent.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, delay)))
    this.queues.set(key, queue)
    queue.then(() => {
      if (this.queues.get(key) === queue) this.queues.delete(key)
    })
    return sent
  }

  private hooks(name: string, place: Place): Hook[] {
    const policy = this.state.policy
    const hooks: Hook[] = (this.ctx.events._hooks as Record<string, Hook[]>)[name] ?? []
    if (!policy) return [...hooks]
    return hooks.filter((hook) => {
      if (hook.global) return true
      const owner = policy.owner(hook.ctx)
      return owner === undefined || policy.accepts(owner, place)
    })
  }

  private failed(hook: Hook, name: string, error: unknown) {
    const owner = this.ownerOf(hook.ctx)
    hook.ctx.logger('bots').warn(`${name} listener failed:`, error)
    if (owner !== undefined) this.state.policy!.failed(owner, error)
  }

  /** cordis' parallel, but a listener that throws is noted against its plugin instead of failing the others. */
  private async fanOut(name: string, place: Place, args: unknown[]) {
    await Promise.all(this.hooks(name, place).map(async (hook) => {
      try {
        await hook.callback(...args)
      } catch (error) {
        this.failed(hook, name, error)
      }
    }))
  }

  /**
   * cordis' waterfall over the listeners in scope, message listeners in the host's order. A listener that throws is
   * noted and passed by: thrown before next(), the rest still get their turn; after, what they did stands.
   */
  private chain<T>(name: string, place: Place, args: unknown[], inner: () => Promise<T>, ranked = true): Promise<T> {
    let hooks = this.hooks(name, place)
    const policy = this.state.policy
    if (ranked && policy) {
      const rankOf = (hook: Hook) => {
        const owner = policy.owner(hook.ctx)
        return (owner === undefined ? undefined : policy.rank(owner)) ?? Infinity
      }
      hooks = hooks.map(hook => ({ hook, rank: rankOf(hook) })).sort((a, b) => a.rank - b.rank).map(({ hook }) => hook)
    }
    const dispatch = async (index: number): Promise<T> => {
      const hook = hooks[index]
      if (!hook) return inner()
      let rest: Promise<T> | undefined
      const next = () => {
        if (rest) throw new Error('next() called multiple times')
        return rest = dispatch(index + 1)
      }
      try {
        return await hook.callback(...args, next)
      } catch (error) {
        this.failed(hook, name, error)
        return await (rest ?? next())
      }
    }
    return dispatch(0)
  }
}

export default BotsService
