import h from '@satorijs/element'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot, NeutralEvent, Universal } from '@luckylillia/plugin-sdk'
import BotsService from '@/universal/bots'
import { CommandService, CommandSettings, DEFAULT_SETTINGS, tokenize } from '@/universal/commands'

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

  it('lists the commands, and tells how to use one, with help', async () => {
    const echo = ctx.command('echo <message:text>', '复读').alias('复读').option('times', '-t <n:posint> 复读几次').example('echo 你好')
    ctx.command('secret', '', { hidden: true }).action(() => {})
    ctx.commands.command('ping', '看看在不在').action(() => 'pong')
    await say('help')
    await say('/help echo')
    expect(sent).toEqual([
      '可用的指令：\n/help  查看有哪些指令，或者一个指令的用法\n/ping  看看在不在\n发送「/help 指令名」查看用法',
      '没有叫 echo 的指令。',
    ])
    echo.action(({ args: [message] }) => message)
    sent.length = 0
    await say('help 复读')
    await say('echo <at id="U2"/> 你好')
    expect(sent).toEqual([
      'echo &lt;message:text&gt;\n复读\n别名：复读\n选项：\n  -t, --times &lt;n:posint&gt;  复读几次\n示例：\n  echo 你好',
      '<at id="U2"/> 你好',
    ])
    settings.current = { ...settings.current, help: false }
    sent.length = 0
    await say('help')
    expect(sent).toEqual([])
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
    expect(ctx.commands.list().map(command => command.name)).toEqual(['help'])
  })

  it('puts the commands on the menu of the bots that have one, when they come online and after a change', async () => {
    vi.useFakeTimers()
    const menus: string[][] = []
    const official: Bot = { ...bot, sid: 'qq:A', updateCommands: async (commands: Universal.Command[]) => void menus.push(commands.map(c => c.name)) }
    ctx.command('sign', '签到').action(() => {})
    ctx.command('secret', '', { hidden: true }).action(() => {})
    await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(official) } })
    expect(menus).toEqual([['help', 'sign']])
    ctx.command('rank').action(() => {})
    await vi.advanceTimersByTimeAsync(2_000)
    expect(menus).toEqual([['help', 'sign'], ['help', 'sign', 'rank']])
  })
})
