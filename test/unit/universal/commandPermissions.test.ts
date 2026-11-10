import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '@/universal/testing'
import { CommandsSchema, commandsSettings } from '@/plugin/internal/service/commands/settings'

let app: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => { app = await createTestApp() })
afterEach(async () => { await app.dispose() })

describe('central command permissions', () => {
  it('applies changes immediately to the canonical name and all aliases, ignoring case', async () => {
    app.ctx.command('login').alias('connect').action(() => 'ready')
    app.commands.aliases = [{ owner: '', command: 'login', aliases: ['扫码'] }]
    const bot = app.bot()
    expect(await bot.receive('LOGIN')).toEqual(['ready'])
    expect(app.ctx.commands.list()[0]).toMatchObject({ authority: 'everyone', defaultAuthority: 'everyone' })

    app.commands.permissions = [{ owner: '', command: 'LoGiN', authority: 'owner' }]
    app.commands.owners = ['test:allowed']
    for (const name of ['login', '/CONNECT', '扫码']) {
      expect(await bot.receive(name)).toEqual(['你没有权限使用这个指令。'])
      expect(await bot.receive(name, { userId: 'allowed' })).toEqual(['ready'])
    }
    expect(app.ctx.commands.list()[0]).toMatchObject({ authority: 'owner', defaultAuthority: 'everyone' })
    expect(await app.bot({ platform: 'qq' }).receive('login', { userId: 'allowed' })).toEqual(['你没有权限使用这个指令。'])

    app.commands.permissions = []
    expect(await bot.receive('扫码')).toEqual(['ready'])
    expect(app.ctx.commands.list()[0].authority).toBe('everyone')
  })

  it('uses group roles and the central owner list for an admin override', async () => {
    app.ctx.command('login').action(() => 'ready')
    app.commands.permissions = [{ owner: '', command: 'login', authority: 'admin' }]
    app.commands.owners = ['test:allowed']
    const bot = app.bot()
    expect(await bot.receive('login', { guildId: 'group' })).toEqual(['你没有权限使用这个指令。'])
    expect(await bot.receive('login', { guildId: 'group', event: { member: { roles: [{ id: 'admin' }] } } })).toEqual(['ready'])
    bot.getGuildMember = async () => ({ roles: [{ id: 'owner' }] })
    expect(await bot.receive('login', { guildId: 'group' })).toEqual(['ready'])
    expect(await bot.receive('login')).toEqual(['你没有权限使用这个指令。'])
    expect(await bot.receive('login', { userId: 'allowed' })).toEqual(['ready'])
  })

  it('can relax a plugin default and restores it when the override is removed', async () => {
    app.ctx.command('restricted', '', { authority: 'owner', hidden: true }).action(() => 'ready')
    const bot = app.bot()
    expect(await bot.receive('restricted')).toEqual(['你没有权限使用这个指令。'])
    app.commands.permissions = [{ owner: '', command: 'restricted', authority: 'everyone' }]
    expect(await bot.receive('restricted')).toEqual(['ready'])
    expect(app.ctx.commands.list()[0]).toMatchObject({ authority: 'everyone', defaultAuthority: 'owner', hidden: true })
    app.commands.permissions = []
    expect(await bot.receive('restricted')).toEqual(['你没有权限使用这个指令。'])
  })

  it('isolates same-named commands by plugin entry and retains overrides across reloads', async () => {
    const owners = new WeakMap<object, string>()
    app.ctx.bots.usePolicy({
      owner: ctx => owners.get(ctx.fiber),
      accepts: (owner, place) => owner === 'first' ? place.guildId === 'G1' : place.guildId === 'G2',
      rank: () => undefined,
      failed: () => {},
    })
    const register = async (id: string) => {
      const fiber = await app.ctx.plugin({ inject: ['commands'], apply(ctx) {
        ctx.command('login').alias('connect').action(() => id)
      } })
      owners.set(fiber.ctx.fiber, id)
      return fiber
    }
    const first = await register('first')
    await register('second')
    app.commands.permissions = [{ owner: 'first', command: 'LOGIN', authority: 'owner' }]
    const bot = app.bot()
    expect(await bot.receive('connect', { guildId: 'G1' })).toEqual(['你没有权限使用这个指令。'])
    expect(await bot.receive('connect', { guildId: 'G2' })).toEqual(['second'])
    expect(app.ctx.commands.list().map(command => [command.owner, command.authority])).toEqual([
      ['first', 'owner'], ['second', 'everyone'],
    ])
    await first.dispose()
    await register('first')
    expect(await bot.receive('login', { guildId: 'G1' })).toEqual(['你没有权限使用这个指令。'])
    expect(await bot.receive('login', { guildId: 'G2' })).toEqual(['second'])
  })

  it('accepts old settings, validates permissions and normalizes duplicate overrides', () => {
    expect(CommandsSchema({ prefixes: ['!'], bare: false }).permissions).toEqual([])
    expect(() => CommandsSchema({ permissions: [{ command: 'login', authority: 'invalid' }] })).toThrow()
    const parsed = CommandsSchema({ permissions: [
      { owner: ' first ', command: ' Login ', authority: 'admin' },
      { owner: 'first', command: 'LOGIN', authority: 'owner' },
      { owner: 'second', command: 'login', authority: 'everyone' },
    ] })
    expect(commandsSettings.normalize!(parsed).permissions).toEqual([
      { owner: 'first', command: 'LOGIN', authority: 'owner' },
      { owner: 'second', command: 'login', authority: 'everyone' },
    ])
  })
})
