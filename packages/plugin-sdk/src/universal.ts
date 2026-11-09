import type h from '@satorijs/element'
import type * as Universal from '@satorijs/protocol'

/** A user in an event, snake_case as on the wire. */
export interface NeutralUser {
  id: string
  name?: string
  nick?: string
  avatar?: string
  is_bot?: boolean
}

/** The event types the bots dispatch; plugins and other sources may add their own. */
export type EventName =
  | 'message-created' | 'message-deleted' | 'message-updated'
  | 'guild-added' | 'guild-removed' | 'guild-updated' | 'guild-request'
  | 'guild-member-added' | 'guild-member-removed' | 'guild-member-updated' | 'guild-member-request'
  | 'friend-request' | 'friend-added' | 'friend-deleted'
  | 'reaction-added' | 'reaction-removed'
  | 'channel-added' | 'channel-updated' | 'channel-deleted'
  | 'interaction/button'
  /** The platform's own event, as it is: `_type` and `_data` */
  | 'internal'
  | (string & {})

/** A Satori event exactly as it goes over the wire (snake_case). Prefer the Session accessors. */
export interface NeutralEvent {
  sn: number
  type: EventName
  self_id: string
  platform: string
  timestamp: number
  user?: NeutralUser
  member?: { user?: NeutralUser; nick?: string; avatar?: string; roles?: { id: string; name?: string }[]; joined_at?: number }
  guild?: { id: string; name?: string; avatar?: string }
  channel?: { id: string; type?: number; name?: string; parent_id?: string }
  message?: { id?: string; content?: string; created_at?: number; quote?: NeutralResource }
  /** Who did it, e.g. the admin who removed a member */
  operator?: NeutralUser
  /** An `interaction/button` event's button */
  button?: { id: string; data?: string }
  /** What the source wants back to reply to this event; see SendOptions.referrer */
  referrer?: unknown
  /** An `internal` event: `<platform>/<the platform's event name>`, e.g. `qq/group-msg-receive` */
  _type?: string
  /** An `internal` event: the platform's data, as it came */
  _data?: unknown
  [field: string]: any
}

/** Any Satori resource (message, user, guild, member...) in its wire form. */
export type NeutralResource = Record<string, any>

export interface SendOptions {
  /** Id of the message to quote. */
  quote?: string
  /**
   * The `referrer` of the event this answers, as in Satori: QQ official bots reply passively to that message or
   * event instead of the latest one in the channel. `session.send()` and `session.reply()` pass it.
   */
  referrer?: unknown
  /**
   * Sent for a protocol client (the Satori adapter): `bot/before-send` and `bot/fallback` are skipped, so plugins
   * cannot rewrite what a client sends; the built-in fallbacks still apply.
   */
  relay?: boolean
}

/**
 * What a bot sends as the platform's own thing. The first four are elements beyond Satori's: one the bot lacks is
 * swapped for its fallback before sending (a `bot/fallback` listener's, else the built-in one), so a plugin may
 * send them anywhere. The others only say what the platform does.
 */
export type Feature =
  /** `<markdown>`; without it, formatted text with the images and links kept */
  | 'message.markdown'
  /** `<button>`, `<button-group>`; without them, a line of what to send. Callback buttons are dropped */
  | 'message.button'
  /** `<card>` (CardAttrs); without it, the title with the link, the description and the image */
  | 'message.card'
  /** `<face>` (FaceAttrs); without it, `[name]` */
  | 'message.face'
  /** `<message forward>` */
  | 'message.forward'
  /**
   * `<markdown stream>` builds one reply up part by part, and `<markdown stream="end">` is its last part; a stream
   * left open ends 10 seconds after its last part. QQ official bots stream in C2C; in groups the parts go out
   * together, as one message, once the stream ends.
   */
  | 'message.stream'
  /** Sending with no message to reply to. The QQ official bot can, within a monthly quota per user or group */
  | 'message.proactive'
  /** Satori's: a guild has no channels of its own, its id is its channel's, as with QQ groups */
  | 'guild.plain'

/** `<card>`: a link shown as the platform's own card. */
export interface CardAttrs {
  title: string
  url: string
  desc?: string
  /** Picture url */
  image?: string
  /** What the chat list and the notification show */
  prompt?: string
}

/** `<face>`: a QQ system face, e.g. 13 for 呲牙. */
export interface FaceAttrs {
  id: string
  /** Without brackets, e.g. 呲牙; what the fallback shows */
  name?: string
}

/**
 * `<button>`, its label in the children; `<button-group>` around buttons starts a row. A command button, the kind
 * every platform can do something with, sends `text` (default: the label) when clicked; the fallback asks to
 * send it instead.
 */
export interface ButtonAttrs {
  /**
   * `link` opens `href`. `action` is a callback button: a click only brings an `interaction/button` event with
   * this `id`, and the fallback drops it. Anything else (`input` too) makes a command button
   */
  type?: 'link' | 'input' | 'action'
  id?: string
  text?: string
  href?: string
  /** The QQ official bot's own button fields, which win over the ones above */
  action?: { type?: number; data?: string; [field: string]: unknown }
}

/**
 * One account on one platform. Only sendMessage is guaranteed; probe the rest, e.g.
 * `if (bot.deleteMessage) ...`, since not every platform supports everything. The optional methods are Satori's,
 * with its names and argument order (`@satorijs/protocol` Methods): the Satori adapter calls them by name.
 */
export interface Bot {
  readonly platform: string
  readonly selfId: string
  /** `${platform}:${selfId}` */
  readonly sid: string
  readonly status: Universal.Status
  readonly features: readonly Feature[]
  /** The account itself, as a Satori user. */
  readonly user?: NeutralResource
  /**
   * The platform's own API, for what has no Satori method. The QQ account (`luckylillia`): the OneBot 11 actions
   * with the go-cqhttp and LLOneBot extensions, camelCased (`set_group_card` is `setGroupCard`), one object of the
   * OneBot parameters, resolving to the action's `data` and rejecting with its error; a `message_id` may be a
   * `session.messageId`. The QQ official bot: its REST API.
   */
  readonly internal?: Record<string, (...args: any[]) => Promise<any>>
  sendMessage(channelId: string, content: h.Fragment, options?: SendOptions): Promise<NeutralResource[]>
  sendPrivateMessage?(userId: string, content: h.Fragment, options?: SendOptions): Promise<NeutralResource[]>
  getMessage?(channelId: string, messageId: string): Promise<NeutralResource>
  deleteMessage?(channelId: string, messageId: string): Promise<void>
  /** `next`: the `next` of the page before. */
  getMessageList?(channelId: string, next?: string, direction?: string, limit?: number, order?: 'asc' | 'desc'): Promise<NeutralList>
  getUser?(userId: string): Promise<NeutralResource>
  getFriendList?(next?: string): Promise<NeutralList>
  deleteFriend?(userId: string): Promise<void>
  /** Answers a `friend-request` event; `messageId` is the event's message id. */
  handleFriendRequest?(messageId: string, approve: boolean, comment?: string): Promise<void>
  getGuild?(guildId: string): Promise<NeutralResource>
  getGuildList?(next?: string): Promise<NeutralList>
  /** Answers a `guild-request` event, an invitation to join a guild. */
  handleGuildRequest?(messageId: string, approve: boolean, comment?: string): Promise<void>
  getChannel?(channelId: string, guildId?: string): Promise<NeutralResource>
  getChannelList?(guildId: string, next?: string): Promise<NeutralList>
  createChannel?(guildId: string, data: NeutralResource): Promise<NeutralResource>
  updateChannel?(channelId: string, data: NeutralResource): Promise<void>
  /** On QQ, leaving the group. */
  deleteChannel?(channelId: string): Promise<void>
  /** Mutes everyone but the admins, or lifts it. */
  muteChannel?(channelId: string, guildId?: string, enable?: boolean): Promise<void>
  createDirectChannel?(userId: string, guildId?: string): Promise<NeutralResource>
  getGuildMember?(guildId: string, userId: string): Promise<NeutralResource>
  getGuildMemberList?(guildId: string, next?: string): Promise<NeutralList>
  /** `duration` in milliseconds. */
  muteGuildMember?(guildId: string, userId: string, duration: number): Promise<void>
  kickGuildMember?(guildId: string, userId: string, permanent?: boolean): Promise<void>
  /** Answers a `guild-member-request` event; `messageId` is the event's message id. */
  handleGuildMemberRequest?(messageId: string, approve: boolean, comment?: string): Promise<void>
  /** The role ids are the ones in a member's `roles`. */
  getGuildRoleList?(guildId: string, next?: string): Promise<NeutralList>
  setGuildMemberRole?(guildId: string, userId: string, roleId: string): Promise<void>
  unsetGuildMemberRole?(guildId: string, userId: string, roleId: string): Promise<void>
  /** Puts the commands on the platform's command menu, where it has one (the QQ official bot's slash menus). */
  updateCommands?(commands: Universal.Command[]): Promise<void>
  createReaction?(channelId: string, messageId: string, emoji: string): Promise<void>
  deleteReaction?(channelId: string, messageId: string, emoji: string): Promise<void>
  getReactionList?(channelId: string, messageId: string, emoji: string, next?: string): Promise<NeutralList>
}

/** A page of resources; `next` fetches the following one. */
export interface NeutralList {
  data: NeutralResource[]
  next?: string
}

export interface Session {
  readonly bot: Bot
  readonly event: NeutralEvent
  readonly type: EventName
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
  /**
   * The message as a command reads it: a leading quote, the @ of this bot and the blank after them taken off.
   * `atSelf`: the bot was @-ed there. In groups the QQ official bot only gets messages that start with its @.
   */
  readonly stripped: { readonly content: string; readonly atSelf: boolean }
  send(content: h.Fragment): Promise<NeutralResource[]>
  /** Sends to the same channel, quoting the message that triggered the session. */
  reply(content: h.Fragment): Promise<NeutralResource[]>
  /**
   * Sends after what the channel has queued before, then holds the queue for `delay` ms (default 1000): for several
   * messages in a row, which QQ takes for spam when they come too fast.
   */
  sendQueued(content: h.Fragment, delay?: number): Promise<NeutralResource[]>
  /**
   * The next message the same user sends in this channel, as its `stripped.content`; undefined after `timeout` ms
   * (default 60000). That message reaches no plugin. In groups the QQ official bot only gets messages that @ it, so
   * the answer has to @ it as well.
   */
  prompt(timeout?: number): Promise<string | undefined>
}

export interface Bots extends Iterable<Bot> {
  readonly size: number
  get(sid: string): Bot | undefined
  /** For adapter plugins: lists the bot until the calling plugin is disposed. */
  register(bot: Bot): () => void
  /** For adapter plugins: hands an incoming event to the plugin chain. */
  dispatch(bot: Bot, event: NeutralEvent): Promise<void>
  /**
   * For adapter plugins: runs `bot/before-send`, swaps what the bot does not declare in `features` for its fallback
   * (`bot/fallback`), and returns the content to actually send. Pass on the `options` of sendMessage (`relay`).
   */
  beforeSend(bot: Bot, channelId: string, content: h[], options?: SendOptions): Promise<h[]>
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
    /**
     * @mode parallel. A bot was registered, unregistered, or changed status.
     * `ctx.bots.get(bot.sid) === bot` tells whether this bot is still registered.
     */
    'bot/status'(bot: Bot): void
    /**
     * @mode waterfall. Sees what bot.sendMessage is about to send: mutate `content` in place or
     * transform the result of next(); resolve to [] to cancel. Messages sent by OneBot, Milky or
     * Satori clients do not pass through here.
     */
    'bot/before-send'(bot: Bot, channelId: string, content: h[], next: () => Promise<h[]>): h[] | Promise<h[]>
    /**
     * @mode serial. After `bot/before-send`, once for each `markdown` / `card` / `face` element and each row of
     * buttons the bot cannot send (see Feature): return what to send instead, e.g. the markdown rendered to an
     * image, or nothing to leave it to the built-in fallback. The first listener to return something wins; what it
     * returns goes out as it is.
     */
    'bot/fallback'(bot: Bot, channelId: string, element: h): h.Fragment | void | Promise<h.Fragment | void>
  }
}
