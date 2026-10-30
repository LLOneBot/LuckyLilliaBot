import h from '@satorijs/element'
import { Channel } from '@satorijs/protocol'
import type { Bot, NeutralEvent, Session as SessionApi } from '@luckylillia/plugin-sdk'

export class Session implements SessionApi {
  private parsed?: h[]
  private strippedCache?: { content: string; atSelf: boolean }

  constructor(readonly bot: Bot, readonly event: NeutralEvent) {}

  get type(): string {
    return this.event.type
  }

  get platform(): string {
    return this.event.platform
  }

  get selfId(): string {
    return this.event.self_id
  }

  get timestamp(): number {
    return this.event.timestamp
  }

  get userId(): string | undefined {
    return this.event.user?.id ?? this.event.member?.user?.id
  }

  get channelId(): string | undefined {
    return this.event.channel?.id
  }

  get guildId(): string | undefined {
    return this.event.guild?.id
  }

  get messageId(): string | undefined {
    return this.event.message?.id
  }

  get isDirect(): boolean {
    return this.event.channel?.type === Channel.Type.DIRECT
  }

  get content(): string {
    return this.event.message?.content ?? ''
  }

  get elements(): h[] {
    return this.parsed ??= h.parse(this.content)
  }

  get stripped() {
    if (this.strippedCache) return this.strippedCache
    const rest = this.elements.slice()
    const blank = (element: h) => element.type === 'text' && !String(element.attrs.content ?? '').trim()
    while (rest.length && (rest[0].type === 'quote' || blank(rest[0]))) rest.shift()
    const atSelf = rest[0]?.type === 'at' && rest[0].attrs.id === this.selfId
    if (atSelf) rest.shift()
    if (rest[0]?.type === 'text') {
      const text = String(rest[0].attrs.content ?? '').trimStart()
      if (text) rest[0] = h.text(text)
      else rest.shift()
    }
    return this.strippedCache = { content: rest.join(''), atSelf }
  }

  send(content: h.Fragment) {
    return this.bot.sendMessage(this.requireChannel(), content)
  }

  reply(content: h.Fragment) {
    return this.bot.sendMessage(this.requireChannel(), content, { quote: this.messageId })
  }

  private requireChannel(): string {
    if (!this.channelId) throw new Error(`a ${this.type} event has no channel to send to`)
    return this.channelId
  }
}
