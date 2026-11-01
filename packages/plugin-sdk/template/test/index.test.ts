import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '@luckylillia/plugin-sdk/testing'
import * as plugin from '../src/index.js'

let app: TestApp

beforeEach(async () => {
  app = await createTestApp()
  await app.ctx.plugin(plugin, { greeting: '早上好' })
})

afterEach(() => app.dispose())

it('says hello', async () => {
  const bot = app.bot()
  expect(await bot.receive('/hello 小明')).toEqual(['早上好，小明！'])
})

it('answers ping with markdown, or its fallback where the bot has none', async () => {
  expect(await app.bot({ platform: 'qq', features: ['message.markdown'] }).receive('ping')).toEqual(['<markdown>**pong**</markdown>'])
  expect(await app.bot().receive('ping')).toEqual(['<p><b>pong</b></p>'])
})
