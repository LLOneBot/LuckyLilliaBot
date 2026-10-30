import h from '@satorijs/element'
import { Context } from 'cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Bot, NeutralEvent, Session } from '@luckylillia/plugin-sdk'
import BotsService from '@/universal/bots'

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
