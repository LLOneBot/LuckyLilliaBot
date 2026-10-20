import type h from '@satorijs/element'
import type * as Universal from '@satorijs/protocol'

/** A Satori event exactly as it goes over the wire (snake_case). Prefer the Session accessors. */
export interface NeutralEvent {
  sn: number
  type: string
  self_id: string
  platform: string
  timestamp: number
  [field: string]: any
}

/** Any Satori resource (message, user, guild, member...) in its wire form. */
export type NeutralResource = Record<string, any>

export interface SendOptions {
  /** Id of the message to quote. */
  quote?: string
}

/**
 * One account on one platform. Only sendMessage is guaranteed; probe the rest, e.g.
 * `if (bot.deleteMessage) ...`, since not every platform supports everything.
 */
export interface Bot {
  readonly platform: string
  readonly selfId: string
  /** `${platform}:${selfId}` */
  readonly sid: string
  readonly status: Universal.Status
  sendMessage(channelId: string, content: h.Fragment, options?: SendOptions): Promise<NeutralResource[]>
  sendPrivateMessage?(userId: string, content: h.Fragment, options?: SendOptions): Promise<NeutralResource[]>
  getMessage?(channelId: string, messageId: string): Promise<NeutralResource>
  deleteMessage?(channelId: string, messageId: string): Promise<void>
  getUser?(userId: string): Promise<NeutralResource>
  getGuild?(guildId: string): Promise<NeutralResource>
  getGuildMember?(guildId: string, userId: string): Promise<NeutralResource>
  muteGuildMember?(guildId: string, userId: string, duration: number): Promise<void>
  kickGuildMember?(guildId: string, userId: string, permanent?: boolean): Promise<void>
  createReaction?(channelId: string, messageId: string, emoji: string): Promise<void>
}

export interface Session {
  readonly bot: Bot
  readonly event: NeutralEvent
  readonly type: string
  readonly platform: string
  readonly selfId: string
  readonly timestamp: number
  readonly userId?: string
  readonly channelId?: string
  readonly guildId?: string
  readonly messageId?: string
  readonly isDirect: boolean
  /** Satori element markup; empty for events without a message. */
  readonly content: string
  readonly elements: h[]
  send(content: h.Fragment): Promise<NeutralResource[]>
  /** Sends to the same channel, quoting the message that triggered the session. */
  reply(content: h.Fragment): Promise<NeutralResource[]>
}

export interface Bots extends Iterable<Bot> {
  readonly size: number
  get(sid: string): Bot | undefined
  /** For adapter plugins: lists the bot until the calling plugin is disposed. */
  register(bot: Bot): () => void
  /** For adapter plugins: hands an incoming event to the plugin chain. */
  dispatch(bot: Bot, event: NeutralEvent): Promise<void>
  /** For adapter plugins: runs `bot/before-send` and returns the content to actually send. */
  beforeSend(bot: Bot, channelId: string, content: h[]): Promise<h[]>
}

declare module 'cordis' {
  interface Context {
    bots: Bots
  }
  interface Events {
    /**
     * @mode parallel. Every event, before any routing and out of reach of middleware. For transports
     * and logging, which must see what the middleware chain may swallow.
     */
    'bot/session'(session: Session): void
    /**
     * @mode waterfall. Messages from others, through every listener in registration order. A
     * listener that does not call next() swallows the message for all listeners after it.
     * The bot's own messages never come here, they go to `bot/event`.
     */
    'bot/message'(session: Session, next: () => Promise<void>): void | Promise<void>
    /** @mode parallel. Every other event, including the bot's own messages. */
    'bot/event'(session: Session): void
    /** @mode parallel. A bot was registered or went on / offline. */
    'bot/status'(bot: Bot): void
    /**
     * @mode waterfall. Sees what bot.sendMessage is about to send: mutate `content` in place or
     * transform the result of next(); resolve to [] to cancel. Messages sent by OneBot, Milky or
     * Satori clients do not pass through here.
     */
    'bot/before-send'(bot: Bot, channelId: string, content: h[], next: () => Promise<h[]>): h[] | Promise<h[]>
  }
}
