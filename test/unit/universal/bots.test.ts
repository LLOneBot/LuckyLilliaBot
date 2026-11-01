import h from '@satorijs/element'
import { Context } from 'cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Bot, NeutralEvent, Session } from '@luckylillia/plugin-sdk'
import BotsService, { type Place } from '@/universal/bots'

const bot: Bot = {
  platform: 'test',
  selfId: '10000',
  sid: 'test:10000',
  status: 1,
  features: [],
  sendMessage: async () => [],
}

function event(type: string, userId: string, content = 'hi'): NeutralEvent {
  return {
    sn: 1,
    type,
    self_id: bot.selfId,
    platform: bot.platform,
    timestamp: 0,
    user: { id: userId },
    channel: { id: 'c1', type: 0 },
    message: { id: 'm1', content },
  }
}

let ctx: Context

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(BotsService)
})

describe('BotsService', () => {
  it('keeps a bot registered for as long as the plugin that registered it', async () => {
    const adapter = await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(bot) } })
    expect(ctx.bots.get(bot.sid)).toBe(bot)
    expect([...ctx.bots]).toEqual([bot])
    expect(() => ctx.bots.register(bot)).toThrow(/already registered/)
    await adapter.dispose()
    expect(ctx.bots.get(bot.sid)).toBeUndefined()
    expect(ctx.bots.size).toBe(0)
  })

  it('runs message middleware in order and lets one swallow the message', async () => {
    const seen: string[] = []
    ctx.on('bot/message', async (session, next) => {
      seen.push(`a:${session.content}`)
      await next()
      seen.push('a:after')
    })
    ctx.on('bot/message', (session, next) => {
      seen.push('b')
      if (session.content === 'stop') return
      return next()
    })
    ctx.on('bot/message', () => {
      seen.push('c')
    })
    ctx.on('bot/message', (_session, next) => {
      seen.push('first')
      return next()
    }, { prepend: true })

    await ctx.bots.dispatch(bot, event('message-created', '555', 'go'))
    expect(seen).toEqual(['first', 'a:go', 'b', 'c', 'a:after'])
    seen.length = 0
    await ctx.bots.dispatch(bot, event('message-created', '555', 'stop'))
    expect(seen).toEqual(['first', 'a:stop', 'b', 'a:after'])
  })

  it('sends the bot\'s own messages and every other event to bot/event', async () => {
    const middleware: Session[] = []
    const observed: string[] = []
    ctx.on('bot/message', (session, next) => {
      middleware.push(session)
      return next()
    })
    ctx.on('bot/event', (session) => {
      observed.push(`${session.type}:${session.userId}`)
    })
    await ctx.bots.dispatch(bot, event('message-created', bot.selfId))
    await ctx.bots.dispatch(bot, event('guild-member-added', '555'))
    expect(middleware).toEqual([])
    expect(observed).toEqual([`message-created:${bot.selfId}`, 'guild-member-added:555'])
  })

  it('lets bot/before-send rewrite or cancel outgoing content', async () => {
    ctx.on('bot/before-send', async (_bot, _channel, content, next) => {
      content.push(h.text(' (edited)'))
      return next()
    })
    ctx.on('bot/before-send', async (_bot, _channel, _content, next) => {
      const result = await next()
      return result.map(element => element.type === 'text' ? h.text(element.attrs.content.toUpperCase()) : element)
    })
    expect((await ctx.bots.beforeSend(bot, 'c1', [h.text('hi')])).join('')).toBe('HI (EDITED)')

    ctx.on('bot/before-send', (_bot, channel, content, next) => channel === 'muted' ? [] : next(), { prepend: true })
    expect(await ctx.bots.beforeSend(bot, 'muted', [h.text('hi')])).toEqual([])
  })
})

describe('the host\'s listener policy', () => {
  const owners = new WeakMap<object, string>()
  const failures: string[] = []
  let scopes: Record<string, (place: Place) => boolean>
  let ranks: Record<string, number>

  beforeEach(() => {
    failures.length = 0
    scopes = {}
    ranks = {}
    ctx.bots.usePolicy({
      owner: ctx => owners.get(ctx.fiber),
      accepts: (owner, place) => scopes[owner]?.(place) ?? true,
      rank: owner => ranks[owner],
      failed: (owner, error) => failures.push(`${owner}: ${(error as Error).message}`),
    })
  })

  async function plugin(name: string, apply: (ctx: Context) => void) {
    const fiber = await ctx.plugin({ apply })
    owners.set(fiber.ctx.fiber, name)
  }

  it('keeps events from the plugins whose scope leaves the place out, global listeners aside', async () => {
    const seen: string[] = []
    await plugin('a', ctx => ctx.on('bot/event', session => void seen.push(`a:${session.channelId}`)))
    await plugin('b', (ctx) => {
      ctx.on('bot/event', session => void seen.push(`b:${session.channelId}`))
      ctx.on('bot/event', session => void seen.push(`b-global:${session.channelId}`), { global: true })
    })
    scopes.b = place => place.channelId === 'c2'
    await ctx.bots.dispatch(bot, event('guild-member-added', '555'))
    expect(seen.sort()).toEqual(['a:c1', 'b-global:c1'])
  })

  it('runs the ranked plugins\' middleware first, in rank order, then the rest as registered', async () => {
    const seen: string[] = []
    for (const name of ['a', 'b', 'c']) {
      await plugin(name, ctx => ctx.on('bot/message', (_session, next) => {
        seen.push(name)
        return next()
      }))
    }
    ranks.c = 0
    ranks.b = 1
    await ctx.bots.dispatch(bot, event('message-created', '555'))
    expect(seen).toEqual(['c', 'b', 'a'])
  })

  it('notes a listener that throws against its plugin and lets the others have the event', async () => {
    const seen: string[] = []
    await plugin('broken', (ctx) => {
      ctx.on('bot/message', () => {
        throw new Error('before next')
      })
      ctx.on('bot/event', () => {
        throw new Error('in an event')
      })
    })
    await plugin('after', (ctx) => {
      ctx.on('bot/message', () => void seen.push('message'))
      ctx.on('bot/event', () => void seen.push('event'))
    })
    await ctx.bots.dispatch(bot, event('message-created', '555'))
    await ctx.bots.dispatch(bot, event('guild-member-added', '555'))
    expect(seen).toEqual(['message', 'event'])
    expect(failures).toEqual(['broken: before next', 'broken: in an event'])
  })

  it('leaves out of bot/before-send the plugins that do not take the channel', async () => {
    await plugin('signature', ctx => ctx.on('bot/before-send', (_bot, _channel, content, next) => {
      content.push(h.text(' -- bot'))
      return next()
    }))
    scopes.signature = place => !place.isDirect
    expect((await ctx.bots.beforeSend(bot, 'c1', [h.text('hi')])).join('')).toBe('hi -- bot')
    expect((await ctx.bots.beforeSend(bot, 'private:555', [h.text('hi')])).join('')).toBe('hi')
  })
})

describe('Session.prompt and sendQueued', () => {
  it('hands the user\'s next message in the channel to the prompt instead of the middleware', async () => {
    const middleware: string[] = []
    let answer: Promise<string | undefined> | undefined
    ctx.on('bot/message', (session, next) => {
      middleware.push(`${session.userId}:${session.content}`)
      if (session.content === 'quiz') answer = session.prompt(1000)
      return next()
    })
    await ctx.bots.dispatch(bot, event('message-created', '555', 'quiz'))
    await ctx.bots.dispatch(bot, event('message-created', '666', 'not me'))
    await ctx.bots.dispatch(bot, event('message-created', '555', '<at id="10000"/> 42'))
    expect(await answer).toBe('42')
    expect(middleware).toEqual(['555:quiz', '666:not me'])
  })

  it('gives up on a prompt after its timeout', async () => {
    let session: Session | undefined
    ctx.on('bot/message', (s) => {
      session = s
    })
    await ctx.bots.dispatch(bot, event('message-created', '555'))
    expect(await session!.prompt(10)).toBeUndefined()
  })

  it('sends a channel\'s queued messages one after another, the given time apart', async () => {
    const sent: [string, number][] = []
    const start = Date.now()
    const queued: Bot = { ...bot, sid: 'test:queued', sendMessage: async (_channel, content) => {
      sent.push([String(content), Date.now() - start])
      return []
    } }
    let session: Session | undefined
    ctx.on('bot/message', (s) => {
      session = s
    })
    await ctx.bots.dispatch(queued, event('message-created', '555'))
    await Promise.all([session!.sendQueued('a', 50), session!.sendQueued('b', 50), session!.sendQueued('c', 50)])
    expect(sent.map(([content]) => content)).toEqual(['a', 'b', 'c'])
    expect(sent[1][1] - sent[0][1]).toBeGreaterThanOrEqual(45)
    expect(sent[2][1] - sent[1][1]).toBeGreaterThanOrEqual(45)
  })
})

describe('Session.stripped', () => {
  async function stripped(content: string) {
    let result: Session['stripped'] | undefined
    ctx.on('bot/message', (session, next) => {
      result = session.stripped
      return next()
    })
    await ctx.bots.dispatch(bot, event('message-created', '555', content))
    return result
  }

  it('takes a leading quote and @ of the bot off, and the blank after them', async () => {
    expect(await stripped('<quote id="m0"/> <at id="10000"/>  echo <b>hi</b>')).toEqual({ content: 'echo <b>hi</b>', atSelf: true })
  })

  it('keeps an @ of someone else, and the message as it is without one', async () => {
    expect(await stripped('<at id="20000"/> echo')).toEqual({ content: '<at id="20000"/> echo', atSelf: false })
    expect(await stripped('echo &lt;3')).toEqual({ content: 'echo &lt;3', atSelf: false })
    expect(await stripped('<at id="10000"/>')).toEqual({ content: '', atSelf: true })
  })
})
