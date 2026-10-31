/**
 * Group and C2C messages mostly go out as passive replies now: since 2025-04-21 proactive ones need the
 * group owner's consent or an interaction recall. A reply cites a received message (msg_id) or another
 * event (event_id), within a window and a count, and each reply to one msg_id needs its own msg_seq.
 * Guild replies cite a message within 5 minutes, with no count kept (as Koishi adapter-qq-crack does).
 */
export interface ReplyContext {
  id: string
  kind: 'message' | 'event'
  scope: 'group' | 'c2c' | 'guild'
  channelId: string
  /** When the message was sent; the window runs from there, not from when it arrived */
  at: number
  seq: number
  replies: number
  /** Refused by the server as expired or used up */
  exhausted?: boolean
}

// bot.q.qq.com, message overview: group 5 minutes and 5 replies, C2C 60 minutes and 4 replies
const WINDOW = { group: 5 * 60_000, c2c: 60 * 60_000, guild: 5 * 60_000 }
const LIMIT = { group: 5, c2c: 4, guild: Infinity }
// Room for the request to reach the server before the window shuts
const MARGIN = 10_000
const PER_CHANNEL = 20
const REF_LIMIT = 2000
const REF_TTL = 60 * 60_000

export class PassiveReplies {
  private channels = new Map<string, ReplyContext[]>()
  private byId = new Map<string, ReplyContext>()
  // A quote cites the REFIDX_ index of a message, not its id
  private refs = new Map<string, { ref: string; at: number }>()
  private lastSweep = 0

  constructor(private now: () => number = Date.now) {}

  /** False when it is already known, i.e. the platform pushed it again. */
  remember(context: Omit<ReplyContext, 'seq' | 'replies'>): boolean {
    const now = this.now()
    if (now - this.lastSweep > 60_000) {
      this.sweep(now)
      this.lastSweep = now
    }
    if (this.byId.has(context.id)) return false
    const entry: ReplyContext = { ...context, seq: 0, replies: 0 }
    const list = this.channels.get(context.channelId) ?? []
    list.push(entry)
    while (list.length > PER_CHANNEL) this.byId.delete(list.shift()!.id)
    this.channels.set(context.channelId, list)
    this.byId.set(entry.id, entry)
    return true
  }

  /**
   * The preferred message if it can still take a reply in this channel, else the latest one that can. For a part of
   * a stream (`streaming` tells which messages have one open), a stream open on the preferred message carries on
   * however many replies it took; with no message preferred, the latest stream open in the channel does.
   */
  pick(channelId: string, preferred?: string, streaming?: (id: string) => boolean): ReplyContext | undefined {
    const now = this.now()
    const list = this.channels.get(channelId) ?? []
    const latest = (accept: (context: ReplyContext) => boolean) => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (accept(list[i])) return list[i]
      }
    }
    const wanted = preferred ? this.byId.get(preferred) : undefined
    if (wanted && wanted.channelId === channelId) {
      if (streaming?.(wanted.id) ? this.live(wanted, now) : this.usable(wanted, now)) return wanted
    } else if (streaming) {
      const open = latest(context => streaming(context.id) && this.live(context, now))
      if (open) return open
    }
    return latest(context => this.usable(context, now))
  }

  find(id: string): ReplyContext | undefined {
    return this.byId.get(id)
  }

  /** The fields of one reply; counts it against the context unless told not to. */
  claim(context: ReplyContext, counted = true): { msg_id?: string; event_id?: string; msg_seq: number } {
    if (counted) context.replies++
    context.seq++
    return context.kind === 'message'
      ? { msg_id: context.id, msg_seq: context.seq }
      : { event_id: context.id, msg_seq: context.seq }
  }

  /** The server refused it as expired or used up: never offer it again. */
  exhaust(context: ReplyContext) {
    context.exhausted = true
  }

  rememberRef(messageId: string, ref: string) {
    this.refs.delete(messageId)
    this.refs.set(messageId, { ref, at: this.now() })
    while (this.refs.size > REF_LIMIT) this.refs.delete(this.refs.keys().next().value!)
  }

  refOf(messageId: string): string | undefined {
    if (messageId.startsWith('REFIDX_')) return messageId
    const entry = this.refs.get(messageId)
    if (entry && this.now() - entry.at < REF_TTL) return entry.ref
  }

  messageIdOf(ref: string): string | undefined {
    const now = this.now()
    for (const [messageId, entry] of this.refs) {
      if (entry.ref === ref && now - entry.at < REF_TTL) return messageId
    }
  }

  private live(context: ReplyContext, now: number) {
    return !context.exhausted && now < context.at + WINDOW[context.scope] - MARGIN
  }

  private usable(context: ReplyContext, now: number) {
    return this.live(context, now) && context.replies < LIMIT[context.scope]
  }

  private sweep(now: number) {
    for (const [channelId, list] of this.channels) {
      const kept = list.filter(entry => now < entry.at + WINDOW[entry.scope])
      for (const entry of list) if (!kept.includes(entry)) this.byId.delete(entry.id)
      if (kept.length) this.channels.set(channelId, kept)
      else this.channels.delete(channelId)
    }
  }
}
