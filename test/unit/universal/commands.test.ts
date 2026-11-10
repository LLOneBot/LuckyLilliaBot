import h from '@satorijs/element'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot, NeutralEvent, Universal } from '@luckylillia/plugin-sdk'
import BotsService from '@/universal/bots'
import { CommandService, CommandSettings, DEFAULT_SETTINGS, tokenize } from '@/universal/commands'
import * as CommandsPlugin from '@/plugin/internal/service/commands'
import { CommandsSchema, commandsSettings } from '@/plugin/internal/service/commands/settings'

let ctx: Context
let settings: { current: CommandSettings }
let sent: string[]
let bot: Bot

function message(content: string, extra: Partial<NeutralEvent> = {}): NeutralEvent {
  return {
    sn: 1,
    type: 'message-created',
    self_id: bot.selfId,
    platform: bot.platform,
    timestamp: 0,
    user: { id: 'U1' },
    channel: { id: 'G1', type: 0 },
    guild: { id: 'G1' },
    message: { id: 'm1', content },
    ...extra,
  }
}

const say = (content: string, extra?: Partial<NeutralEvent>) => ctx.bots.dispatch(bot, message(content, extra))

beforeEach(async () => {
  sent = []
  bot = {
    platform: 'test',
    selfId: 'B',
    sid: 'test:B',
    status: 1,
    features: [],
    sendMessage: async (_channel, content) => {
      sent.push(h.normalize(content).join(''))
      return []
    },
  }
  ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(BotsService)
  settings = { current: { ...DEFAULT_SETTINGS } }
  await ctx.plugin(CommandService, settings)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tokenize', () => {
  it('splits at blanks, keeps quoted blanks and whole elements, and knows what follows each word', () => {
    const tokens = tokenize('a "b c" <at id="1"/> 「d e」 x&lt;y')
    expect(tokens.map(token => token.value)).toEqual(['a', 'b c', '<at id="1"/>', 'd e', 'x&lt;y'])
    expect(tokens[2].element?.type).toBe('at')
    expect(tokens[1].rest).toBe('"b c" <at id="1"/> 「d e」 x&lt;y')
  })
})

describe('commands', () => {
  it('runs every configured alias alongside the canonical name and plugin aliases, without duplicate list entries', async () => {
    ctx.command('hello <name>').alias('hi', 'HI', 'HELLO').action((_, name) => `hello ${name}`)
    settings.current = { ...settings.current, aliases: [
      { owner: '', command: 'hello', aliases: ['greet', '问好', 'HI', 'HELLO'] },
      { owner: '', command: 'hello', aliases: ['GREET', 'greet friend'] },
    ] }
    for (const name of ['hello', 'hi', 'GREET', '问好', 'greet friend']) await say(`/${name} world`)
    expect(sent).toEqual(Array(5).fill('hello world'))
    expect(ctx.commands.list()[0].aliases).toEqual(['hi', 'greet', '问好', 'greet friend'])
  })

  it('updates and clears custom aliases immediately, keeps plugin defaults, and restores aliases after registration', async () => {
    const owners = new WeakMap<object, string>()
    ctx.bots.usePolicy({ owner: ctx => owners.get(ctx.fiber), accepts: () => true, rank: () => undefined, failed: () => {} })
    const plugin = { inject: ['commands'], apply: (ctx: Context) => {
      ctx.command('hello').alias('hi').action(() => 'hello')
    } }
    const first = await ctx.plugin(plugin)
    owners.set(first.ctx.fiber, 'greeting')
    settings.current = { ...settings.current, aliases: [{ owner: 'greeting', command: 'hello', aliases: ['hey', '你好'] }] }
    await say('/hey')
    settings.current = { ...settings.current, aliases: [{ owner: 'greeting', command: 'hello', aliases: ['welcome'] }] }
    await say('/hey')
    await say('/你好')
    await say('/welcome')
    settings.current = { ...settings.current, aliases: [] }
    await say('/welcome')
    await say('/hi')
    expect(sent).toEqual(['hello', 'hello', 'hello'])
    expect(ctx.commands.list()[0].aliases).toEqual(['hi'])

    settings.current = { ...settings.current, aliases: [{ owner: 'greeting', command: 'hello', aliases: ['welcome'] }] }
    await first.dispose()
    await say('/welcome')
    expect(sent).toHaveLength(3)
    expect(ctx.commands.list()).toEqual([])
    const second = await ctx.plugin(plugin)
    owners.set(second.ctx.fiber, 'greeting')
    await say('/welcome')
    expect(sent).toHaveLength(4)
    expect(ctx.commands.list()[0].aliases).toEqual(['hi', 'welcome'])
  })

  it('keeps aliases tied to plugin entries and scopes, reporting conflicts between effective names', async () => {
    const owners = new WeakMap<object, string>()
    ctx.bots.usePolicy({
      owner: ctx => owners.get(ctx.fiber),
      accepts: (owner, place) => owner === 'g1' ? place.guildId === 'G1' : place.guildId === 'G2',
      rank: () => undefined,
      failed: () => {},
    })
    for (const owner of ['g1', 'g2']) {
      const fiber = await ctx.plugin({ inject: ['commands'], apply: (ctx: Context) => {
        ctx.command('sign').alias(`default-${owner}`).action(() => owner)
      } })
      owners.set(fiber.ctx.fiber, owner)
    }
    settings.current = { ...settings.current, aliases: [
      { owner: 'g1', command: 'sign', aliases: ['check in', 'shared'] },
      { owner: 'g2', command: 'sign', aliases: ['attend', 'SHARED'] },
      { owner: '', command: 'sign', aliases: ['host-sign'] },
    ] }
    const g2 = { channel: { id: 'G2', type: 0 }, guild: { id: 'G2' } }
    await say('/check in')
    await say('/attend')
    await say('/check in', g2)
    await say('/attend', g2)
    await say('/host-sign')
    expect(sent).toEqual(['g1', 'g2'])
    expect(ctx.commands.list().map(({ owner, aliases, conflicts }) => ({ owner, aliases, conflicts }))).toEqual([
      { owner: 'g1', aliases: ['default-g1', 'check in', 'shared'], conflicts: [{ name: 'sign', with: 'g2' }, { name: 'shared', with: 'g2' }] },
      { owner: 'g2', aliases: ['default-g2', 'attend', 'SHARED'], conflicts: [{ name: 'sign', with: 'g1' }, { name: 'SHARED', with: 'g1' }] },
    ])
    settings.current = { ...settings.current, aliases: [
      { owner: 'g1', command: 'sign', aliases: ['default-g2'] },
    ] }
    expect(ctx.commands.list()[0].conflicts).toEqual([{ name: 'sign', with: 'g2' }, { name: 'default-g2', with: 'g2' }])
    settings.current = { ...settings.current, aliases: [] }
    expect(ctx.commands.list()[0].conflicts).toEqual([{ name: 'sign', with: 'g2' }])
  })

  it('uses longest custom aliases at element boundaries, retains typed arguments, and allows next middleware', async () => {
    settings.current = { ...settings.current, prefixes: ['!'], bare: false, aliases: [
      { owner: '', command: 'inspect', aliases: ['show user', 'check user'] },
    ] }
    const calls: unknown[] = []
    const seen: string[] = []
    ctx.command('show [text:text]').action((_, text) => { calls.push(['short', text]) })
    ctx.command('inspect <user:user> [content:text]').action(async ({ next }, user, content) => {
      calls.push([user, content])
      await next()
    })
    ctx.on('bot/message', (session, next) => { seen.push(session.content); return next() })
    const element = '<at id="U2" name="another user"/>'
    const image = '<img src="https://example.com/image.png"/>'
    const content = `!SHOW USER${element} ${image}`
    await say(content)
    await say(`!check user${element} words`)
    await say(`check user${element}`)
    await say(`!check users${element}`)
    await say(`!check user${h.text(element)}`)
    expect(calls).toEqual([['U2', image], ['U2', 'words']])
    expect(seen).toEqual([content, `!check user${element} words`, `check user${element}`, `!check users${element}`, `!check user${h.text(element)}`])
  })

  it('shares permissions and cooldown across the canonical name and all custom aliases', async () => {
    settings.current = { ...settings.current, owners: ['test:U9'], aliases: [
      { owner: '', command: 'reload', aliases: ['restart', '重载'] },
    ] }
    ctx.command('reload', '', { authority: 'owner', cooldown: 60_000 }).action(() => 'reloaded')
    await say('/restart')
    await say('/restart', { user: { id: 'U9' } })
    await say('/reload', { user: { id: 'U9' } })
    await say('/重载', { user: { id: 'U9' } })
    expect(sent).toEqual(['你没有权限使用这个指令。', 'reloaded', '请在 60 秒后再试。', '请在 60 秒后再试。'])
  })

  it('runs a command after a prefix or none, by its longest name, alias and case aside, and leaves the rest to others', async () => {
    const seen: string[] = []
    ctx.command('sign', '签到').alias('签到').action(() => 'signed')
    ctx.command('sign-rank').action(() => 'rank')
    ctx.on('bot/message', (session, next) => {
      seen.push(session.content)
      return next()
    })
    await say('/sign')
    await say('<at id="B"/> 签到')
    await say('SIGN-RANK')
    await say('signature')
    expect(sent).toEqual(['signed', 'signed', 'rank'])
    expect(seen).toEqual(['signature'])
  })

  it('accepts an image immediately after a name or alias and preserves the complete message argument', async () => {
    const image = h('img', { src: 'https://example.com/image.png', title: 'an image' }).toString()
    const content = `${image}<at id="U2"/> some &lt;text&gt;`
    const calls: string[] = []
    ctx.command('ai吗 [content:text]').alias('aiimgdetector').action((_, value) => { calls.push(value) })
    await say(`/ai吗${content}`)
    await say(`AI吗${content}`)
    await say(`/AiImGdEtEcToR${content}`)
    await say(`<quote id="previous"><img src="https://example.com/quoted.png"/></quote><at id="B"/> /ai吗${content}`)
    expect(calls).toEqual([content, content, content, content])
    expect(sent).toEqual([])
  })

  it('passes an adjacent mention intact to a typed user argument', async () => {
    const calls: unknown[] = []
    ctx.command('inspect <user:user> [content:text]').action((_, user, content) => { calls.push([user, content]) })
    await say('/inspect<at id="U2" name="another user"/> <img src="https://example.com/image.png"/> trailing words')
    expect(calls).toEqual([['U2', '<img src="https://example.com/image.png"/> trailing words']])
  })

  it('keeps longest names and aliases, configured prefixes and bare rules at an element boundary', async () => {
    settings.current = { ...settings.current, prefixes: ['!', '!!'], bare: false }
    const image = '<img src="https://example.com/image.png"/>'
    const calls: unknown[] = []
    const seen: string[] = []
    ctx.command('show [content:text]').action((_, content) => { calls.push(['short', content]) })
    ctx.command('capture [content:text]').alias('show image').action((_, content) => { calls.push(['long', content]) })
    ctx.on('bot/message', (session, next) => { seen.push(session.content); return next() })
    await say(`!!SHOW IMAGE${image}`)
    await say(`!show${image}`)
    await say(`show image${image}`)
    await say(`/show${image}`)
    settings.current = { ...settings.current, bare: true }
    await say(`show image${image}`)
    expect(calls).toEqual([['long', image], ['short', image], ['long', image]])
    expect(seen).toEqual([`show image${image}`, `/show${image}`])
  })

  it('does not mistake escaped markup or a longer word for the end of a command name', async () => {
    const calls = vi.fn()
    const seen: string[] = []
    ctx.command('scan [content:text]').alias('check').action(calls)
    ctx.on('bot/message', (session, next) => { seen.push(session.content); return next() })
    const image = '<img src="https://example.com/image.png"/>'
    const messages = [
      '/scan' + h.text(image),
      '/check&lt;',
      '/scan&lt;' + image,
      '/scanner' + image,
      '/checks' + image,
      image + '/scan',
    ]
    for (const content of messages) await say(content)
    expect(calls).not.toHaveBeenCalled()
    expect(seen).toEqual(messages)
  })

  it('continues later message middleware only when an action explicitly calls next', async () => {
    const seen: string[] = []
    ctx.command('consume').action(() => { seen.push('consumed') })
    ctx.command('skip').action(({ next }) => next())
    ctx.command('around').action(async ({ next }) => {
      seen.push('before')
      await next()
      seen.push('after')
      return 'command reply'
    })
    ctx.on('bot/message', async (session, next) => {
      seen.push(session.content)
      await session.send('later reply')
      return next()
    })
    await say('/consume')
    expect(seen).toEqual(['consumed'])
    expect(sent).toEqual([])
    await say('/skip')
    await say('/around')
    expect(seen).toEqual(['consumed', '/skip', 'before', '/around', 'after'])
    expect(sent).toEqual(['later reply', 'later reply', 'command reply'])
  })

  it('reads typed arguments and options, with fallbacks, and says what is wrong', async () => {
    const calls: unknown[] = []
    ctx.command('mute <user:user> [minutes:posint] [reason:text]')
      .option('silent', '-s 不提示')
      .option('times', '-t <n:integer> 次数', { fallback: 1 })
      .action(({ options }, ...args) => {
        calls.push([options, ...args])
      })
    await say('mute <at id="U2"/> 10 -s --times=3 刷屏 太多')
    await say('mute 12345 -t 2')
    await say('mute <at id="U2"/> zero')
    await say('mute')
    expect(calls).toEqual([
      [{ silent: true, times: 3 }, 'U2', 10, '刷屏 太多'],
      [{ times: 2 }, '12345'],
    ])
    expect(sent).toEqual([
      '参数 minutes 应该是正整数，收到的是 zero\n用法：mute &lt;user:user&gt; [minutes:posint] [reason:text]',
      '缺少参数 user\n用法：mute &lt;user:user&gt; [minutes:posint] [reason:text]',
    ])
  })

  it('has no help of its own: help and 帮助 are left to the plugins', async () => {
    ctx.commands.command('ping', '看看在不在').action(() => 'pong')
    await say('help')
    await say('/帮助')
    expect(sent).toEqual([])
    expect(ctx.commands.list().map(command => command.name)).toEqual(['ping'])
    ctx.command('help', '我的帮助').action(() => '这是插件自己的帮助')
    await say('/help')
    expect(sent).toEqual(['这是插件自己的帮助'])
  })

  it('keeps commands to the owners, or group owners and admins, looking the member up when the event says nothing', async () => {
    ctx.command('reload', '', { authority: 'owner' }).action(() => 'reloaded')
    ctx.command('kick', '', { authority: 'admin' }).action(() => 'kicked')
    settings.current = { ...settings.current, owners: ['test:U9'] }
    await say('reload')
    await say('reload', { user: { id: 'U9' } })
    await say('kick', { member: { roles: [{ id: '3', name: 'admin' }] } })
    await say('kick')
    bot.getGuildMember = async () => ({ roles: [{ id: 'owner', name: 'owner' }] })
    await say('kick')
    expect(sent).toEqual(['你没有权限使用这个指令。', 'reloaded', 'kicked', '你没有权限使用这个指令。', 'kicked'])
  })

  it('makes a user wait out the cooldown', async () => {
    ctx.command('daily', '', { cooldown: 60_000 }).action(() => 'ok')
    await say('daily')
    await say('daily')
    await say('daily', { user: { id: 'U2' } })
    expect(sent).toEqual(['ok', '请在 60 秒后再试。', 'ok'])
  })

  it('answers an action that throws with a short notice, noted against its plugin', async () => {
    const failures: string[] = []
    const owners = new WeakMap<object, string>()
    ctx.bots.usePolicy({ owner: ctx => owners.get(ctx.fiber), accepts: () => true, rank: () => undefined, failed: (owner, e) => failures.push(`${owner}: ${(e as Error).message}`) })
    const fiber = await ctx.plugin({ inject: ['commands'], apply: (ctx: Context) => {
      ctx.command('boom').action(() => { throw new Error('kaboom') })
    } })
    owners.set(fiber.ctx.fiber, 'broken')
    await say('boom')
    expect(sent).toEqual(['执行指令时出错了。'])
    expect(failures).toEqual(['broken: kaboom'])
  })

  it('matches a command only where its plugin takes the message, so two plugins can share a name', async () => {
    const owners = new WeakMap<object, string>()
    ctx.bots.usePolicy({
      owner: ctx => owners.get(ctx.fiber),
      accepts: (owner, place) => owner === 'g1' ? place.guildId === 'G1' : place.guildId !== 'G1',
      rank: () => undefined,
      failed: () => {},
    })
    for (const [name, reply] of [['g1', 'from g1'], ['others', 'from others']]) {
      const fiber = await ctx.plugin({ inject: ['commands'], apply: (ctx: Context) => {
        ctx.command('sign').action(() => reply)
      } })
      owners.set(fiber.ctx.fiber, name)
    }
    await say('sign')
    await say('sign', { channel: { id: 'G2', type: 0 }, guild: { id: 'G2' } })
    expect(sent).toEqual(['from g1', 'from others'])
    expect(ctx.commands.list().filter(command => command.name === 'sign').map(command => [command.owner, command.conflicts])).toEqual([
      ['g1', [{ name: 'sign', with: 'others' }]],
      ['others', [{ name: 'sign', with: 'g1' }]],
    ])
  })

  it('drops the commands of a plugin with it', async () => {
    const fiber = await ctx.plugin({ inject: ['commands'], apply: (ctx: Context) => {
      ctx.command('temp').action(() => 'here')
    } })
    await say('temp')
    await fiber.dispose()
    await say('temp')
    expect(sent).toEqual(['here'])
    expect(ctx.commands.list()).toEqual([])
  })

  it('puts the commands on the menu of the bots that have one, when they come online and after a change', async () => {
    vi.useFakeTimers()
    const menus: string[][] = []
    const official: Bot = { ...bot, sid: 'qq:A', updateCommands: async (commands: Universal.Command[]) => void menus.push(commands.map(c => c.name)) }
    ctx.command('sign', '签到').action(() => {})
    ctx.command('secret', '', { hidden: true }).action(() => {})
    const protocol = await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(official) } })
    expect(menus).toEqual([['sign']])
    ctx.command('rank').action(() => {})
    await vi.advanceTimersByTimeAsync(2_000)
    expect(menus).toEqual([['sign'], ['sign', 'rank']])
    ctx.command('after').action(() => {})
    await protocol.dispose()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(menus).toEqual([['sign'], ['sign', 'rank']])
  })

  it('synchronizes an unchanged menu to a new bot instance registered with the same sid', async () => {
    ctx.command('sign', '签到').action(() => {})
    const oldMenu = vi.fn(async (_commands: Universal.Command[]) => {})
    const oldBot: Bot = { ...bot, updateCommands: oldMenu }
    const oldProtocol = await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(oldBot) } })
    expect(oldMenu).toHaveBeenCalledOnce()
    await oldProtocol.dispose()
    expect(oldMenu).toHaveBeenCalledOnce()
    const newMenu = vi.fn(async (_commands: Universal.Command[]) => {})
    const newBot: Bot = { ...bot, updateCommands: newMenu }
    const newProtocol = await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(newBot) } })
    expect(newMenu).toHaveBeenCalledOnce()
    expect(newMenu.mock.calls[0][0].map(command => command.name)).toEqual(['sign'])
    await newProtocol.dispose()
  })
})

describe('command alias settings', () => {
  it('defaults to no custom aliases and normalizes duplicate rows without changing multi-word aliases', () => {
    expect(new CommandsSchema()).toEqual(DEFAULT_SETTINGS)
    const normalized = commandsSettings.normalize!({ ...DEFAULT_SETTINGS, aliases: [
      { owner: ' plugin-a ', command: ' hello ', aliases: [' hi ', '', '  ', 'HI', 'HELLO', 'greet friend'] },
      { owner: 'plugin-a', command: 'hello', aliases: ['greet friend', '问好', 'hi'] },
      { owner: 'plugin-b', command: 'hello', aliases: ['hi'] },
      { owner: '', command: 'empty', aliases: ['', '   '] },
    ] })
    expect(normalized.aliases).toEqual([
      { owner: 'plugin-a', command: 'hello', aliases: ['hi', 'greet friend', '问好'] },
      { owner: 'plugin-b', command: 'hello', aliases: ['hi'] },
    ])
    expect(commandsSettings.check!(normalized, true)).toEqual([])
  })

  it('reports separate aliases containing a newline, tab or control character', () => {
    const normalized = commandsSettings.normalize!({ ...DEFAULT_SETTINGS, aliases: [
      { owner: '', command: 'hello', aliases: ['hi\nthere', 'hi\tthere', 'hi\u0000there', 'hi there'] },
    ] })
    expect(normalized.aliases![0].aliases).toEqual(['hi\nthere', 'hi\tthere', 'hi\u0000there', 'hi there'])
    const issues = commandsSettings.check!(normalized, true)
    expect(issues.map(issue => issue.path)).toEqual([
      ['aliases', '0', 'aliases', '0'], ['aliases', '0', 'aliases', '1'], ['aliases', '0', 'aliases', '2'],
    ])
    expect(issues[0].message).toContain('每个别名只能填写一行')
  })

  it.each(['hello', [null], [{ command: 'hello', aliases: [42] }], [{ command: 'hello', owner: 42, aliases: ['hi'] }]])(
    'leaves malformed alias settings to schema validation: %j', (aliases) => {
      const normalized = commandsSettings.normalize!({ ...DEFAULT_SETTINGS, aliases } as CommandSettings)
      const result = CommandsSchema['~standard'].validate(normalized) as { issues?: unknown[] }
      expect(result.issues?.length).toBeGreaterThan(0)
    },
  )

  it('applies an actual plugin config update without restarting the command service or dependent plugins', async () => {
    const root = new Context()
    const timer = await root.plugin(TimerService)
    const bots = await root.plugin(BotsService)
    const service = await root.plugin(CommandsPlugin, { ...DEFAULT_SETTINGS })
    const starts = vi.fn()
    const stops = vi.fn()
    const commandPlugin = await root.plugin({ inject: ['commands'], apply(ctx: Context) {
      starts()
      ctx.on('dispose', stops)
      ctx.command('hello').alias('hi').action(() => 'hello')
    } })
    try {
      await service.update({ ...DEFAULT_SETTINGS, aliases: [{ owner: '', command: 'hello', aliases: ['hey', '问好'] }] })
      await root.bots.dispatch(bot, message('/hey'))
      await root.bots.dispatch(bot, message('/问好'))
      expect(sent).toEqual(['hello', 'hello'])
      expect(root.commands.list()[0].aliases).toEqual(['hi', 'hey', '问好'])
      await service.update({ ...DEFAULT_SETTINGS, aliases: [] })
      await root.bots.dispatch(bot, message('/hey'))
      await root.bots.dispatch(bot, message('/hi'))
      expect(sent).toEqual(['hello', 'hello', 'hello'])
      expect(starts).toHaveBeenCalledOnce()
      expect(stops).not.toHaveBeenCalled()
    } finally {
      await commandPlugin.dispose()
      await service.dispose()
      await bots.dispose()
      await timer.dispose()
    }
  })
})
