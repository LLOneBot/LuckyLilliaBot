import { existsSync } from 'node:fs'
import path from 'node:path'
import h from '@satorijs/element'
import type { Context } from 'cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from '@/universal/testing'
import type { TestApp } from '../../../packages/plugin-sdk/src/testing'
// Built by `npm run build:sdk`, which `npm install` runs
import * as bundled from '../../../packages/plugin-sdk/lib/testing.js'

// What a plugin author would test: a command, a question awaiting its answer, markdown, its data directory
const Sample = {
  name: 'sample',
  inject: ['bots', 'commands'],
  apply(ctx: Context) {
    ctx.command('sign', '签到').action(({ session }) => `签到成功：${session.userId}`)
    ctx.command('quiz').action(async ({ session }) => {
      await session.send('1 + 1 = ?')
      return await session.prompt(1000) === '2' ? '答对了' : '答错了'
    })
    ctx.command('where').action(async () => path.basename(await ctx.storage.dir('bot', 'test:bot')))
    ctx.on('bot/message', (session, next) => session.stripped.content === 'md' ? session.send(h('markdown', {}, '**粗体**')).then(() => {}) : next())
  },
}

let app: TestApp | undefined

afterEach(async () => {
  await app?.dispose()
  app = undefined
})

describe('the plugin test kit', () => {
  it('runs a plugin\'s commands and middleware on the bot\'s own neutral layer', async () => {
    app = await createTestApp()
    await app.ctx.plugin(Sample)
    const bot = app.bot()
    expect(await bot.receive('sign', { guildId: 'G1', userId: 'U1' })).toEqual(['签到成功：U1'])
    expect(await bot.receive('/sign')).toEqual(['签到成功：user'])
    app.commands.bare = false
    expect(await bot.receive('sign')).toEqual([])
    expect(bot.sent.map(message => message.channelId)).toEqual(['G1', 'private:user'])
  })

  it('sends what a bot lacks as its fallback, and the rest as it is', async () => {
    app = await createTestApp()
    await app.ctx.plugin(Sample)
    expect(await app.bot().receive('md')).toEqual(['<p><b>粗体</b></p>'])
    expect(await app.bot({ platform: 'qq', features: ['message.markdown'] }).receive('md')).toEqual(['<markdown>**粗体**</markdown>'])
  })

  it('answers a prompt with the next message of the user, and keeps the data directory until disposed', async () => {
    app = await createTestApp()
    await app.ctx.plugin(Sample)
    const bot = app.bot()
    const quiz = bot.receive('quiz')
    await vi.waitFor(() => expect(bot.sent.at(-1)?.content).toBe('1 + 1 = ?'))
    await bot.receive('2')
    expect(await quiz).toEqual(['1 + 1 = ?', '答对了'])
    expect(await bot.receive('where')).toEqual(['test+bot'])
    const { dataDir } = app
    await app.dispose()
    app = undefined
    expect(existsSync(dataDir)).toBe(false)
  })

  it('works the same once bundled into the SDK', async () => {
    app = await bundled.createTestApp()
    await app.ctx.plugin(Sample)
    expect(await app.bot().receive('sign')).toEqual(['签到成功：user'])
  })

  it('keeps adjacent elements and command fallthrough in the published test kit', async () => {
    app = await bundled.createTestApp()
    await app.ctx.plugin({ inject: ['commands'], apply(ctx: Context) {
      ctx.command('inspect [content:text]').action(({ next }, content?: string) => content || next())
      ctx.on('bot/message', session => session.send('后续插件收到：' + session.content).then(() => {}))
    } })
    const bot = app.bot()
    expect(await bot.receive('/inspect<img src="https://example.com/picture.png"/>')).toEqual(['<img src="https://example.com/picture.png"/>'])
    expect(await bot.receive('/inspect')).toEqual(['后续插件收到：/inspect'])
  })
})
