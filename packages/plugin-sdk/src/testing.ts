// `@luckylillia/plugin-sdk/testing`: the declarations. The code is the bot's own neutral layer (BotsService, Session,
// the fallbacks, the commands) with a fake bot, bundled into lib/testing.js by scripts/build-testing.mjs.
import type { Context } from 'cordis'
import type { Bot, Feature, NeutralEvent } from './universal.js'

export interface TestBotOptions {
  /** Default `test` */
  platform?: string
  /** Default `bot` */
  selfId?: string
  /** What it sends natively; markdown, buttons, cards and faces it lacks go out as their fallbacks */
  features?: Feature[]
  /** Its `bot.internal`, for a plugin that calls one */
  internal?: Record<string, (...args: any[]) => Promise<any>>
}

export interface MessageOptions {
  /** Default `user` */
  userId?: string
  name?: string
  /** The group the message comes from; without one it is a private chat */
  guildId?: string
  /** Default: the group, or `private:<userId>` */
  channelId?: string
  /** More of the event, e.g. `{ member: { roles: [{ id: 'admin', name: 'admin' }] } }` */
  event?: Partial<NeutralEvent>
}

export interface SentMessage {
  channelId: string
  /** Element markup, after bot/before-send and the fallbacks */
  content: string
}

export interface TestBot extends Bot {
  /** Everything it sent, in order. */
  readonly sent: SentMessage[]
  /** A message from someone else; resolves, once the plugins handled it, to what the bot sent meanwhile. */
  receive(content: string, options?: MessageOptions): Promise<string[]>
  /** Any other event, e.g. `emit('guild-member-added', { guild: { id: '1' }, user: { id: '2' } })`. */
  emit(type: string, data?: Partial<NeutralEvent>): Promise<void>
}

export interface TestCommandSettings {
  prefixes: string[]
  bare: boolean
  /** `platform:userId`, or a user id on every platform */
  owners: string[]
  help: boolean
}

export interface TestApp {
  /** Load the plugin under test here: `bots`, `commands` and `timer` are in place, `ctx.storage` is a temporary directory. */
  readonly ctx: Context
  /** The command settings; change them in place. */
  readonly commands: TestCommandSettings
  /** The directory behind `ctx.storage`, removed by dispose() */
  readonly dataDir: string
  /** Registers a bot; each call makes another (pass another selfId). */
  bot(options?: TestBotOptions): TestBot
  dispose(): Promise<void>
}

export declare function createTestApp(): Promise<TestApp>
