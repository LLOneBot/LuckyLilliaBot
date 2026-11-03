import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import h from '@satorijs/element'
import { Channel } from '@satorijs/protocol'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import type { Feature, NeutralEvent, NeutralResource, SendOptions } from '@luckylillia/plugin-sdk'
import type {
  MessageOptions, SentMessage, TestApp as TestAppApi, TestBot as TestBotApi, TestBotOptions,
} from '../../packages/plugin-sdk/src/testing'
import BotsService from './bots'
import { CommandService, DEFAULT_SETTINGS, type CommandSettings } from './commands'
import HttpService from './http'

// @luckylillia/plugin-sdk/testing (bundled by packages/plugin-sdk/scripts/build-testing.mjs): the neutral layer as
// the bot runs it, with a bot that only records what it is asked to send

class TestBot implements TestBotApi {
  readonly platform: string
  readonly selfId: string
  readonly sid: string
  readonly status = 1
  readonly features: readonly Feature[]
  readonly user: { id: string; name: string }
  readonly internal?: Record<string, (...args: any[]) => Promise<any>>
  readonly sent: SentMessage[] = []
  private sn = 0

  constructor(private readonly ctx: Context, options: TestBotOptions) {
    this.platform = options.platform ?? 'test'
    this.selfId = options.selfId ?? 'bot'
    this.sid = `${this.platform}:${this.selfId}`
    this.features = options.features ?? []
    this.user = { id: this.selfId, name: 'Bot' }
    this.internal = options.internal
  }

  async sendMessage(channelId: string, content: h.Fragment, options?: SendOptions): Promise<NeutralResource[]> {
    const elements = await this.ctx.bots.beforeSend(this, channelId, h.normalize(content), options)
    if (!elements.length) return []
    const markup = elements.join('')
    this.sent.push({ channelId, content: markup })
    return [{ id: `sent-${this.sent.length}`, content: markup, channel: { id: channelId } }]
  }

  async receive(content: string, options: MessageOptions = {}): Promise<string[]> {
    const before = this.sent.length
    const userId = options.userId ?? 'user'
    const user = { id: userId, name: options.name }
    const guildId = options.guildId
    await this.ctx.bots.dispatch(this, this.event('message-created', {
      user,
      channel: { id: options.channelId ?? guildId ?? `private:${userId}`, type: guildId ? Channel.Type.TEXT : Channel.Type.DIRECT },
      ...guildId ? { guild: { id: guildId }, member: { user } } : {},
      message: { id: `message-${this.sn + 1}`, content },
      ...options.event,
    }))
    return this.sent.slice(before).map(message => message.content)
  }

  async emit(type: string, data: Partial<NeutralEvent> = {}) {
    await this.ctx.bots.dispatch(this, this.event(type, data))
  }

  private event(type: string, data: Partial<NeutralEvent>): NeutralEvent {
    return { sn: ++this.sn, type, self_id: this.selfId, platform: this.platform, timestamp: Date.now(), ...data }
  }
}

export async function createTestApp(): Promise<TestAppApi> {
  const ctx = new Context()
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'luckylillia-test-'))
  // What PluginService gives entries; here every plugin shares the one directory
  ctx.accessor('storage', {
    get: () => ({
      dir: async (scope: string = 'global', bot?: string | { sid: string }) => {
        const sid = typeof bot === 'string' ? bot : bot?.sid
        const dir = path.join(dataDir, scope === 'bot' && sid ? path.join('bots', sid.replace(':', '+')) : scope)
        mkdirSync(dir, { recursive: true })
        return dir
      },
    }),
  })
  await ctx.plugin(TimerService)
  await ctx.plugin(HttpService)
  await ctx.plugin(BotsService)
  const settings: { current: CommandSettings } = { current: { ...DEFAULT_SETTINGS, prefixes: [...DEFAULT_SETTINGS.prefixes] } }
  await ctx.plugin(CommandService, settings)
  return {
    ctx,
    commands: settings.current,
    dataDir,
    bot(options: TestBotOptions = {}) {
      const bot = new TestBot(ctx, options)
      ctx.bots.register(bot)
      return bot
    },
    async dispose() {
      await ctx.registry.delete(CommandService)
      await ctx.registry.delete(BotsService)
      await ctx.registry.delete(HttpService)
      await ctx.registry.delete(TimerService)
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
