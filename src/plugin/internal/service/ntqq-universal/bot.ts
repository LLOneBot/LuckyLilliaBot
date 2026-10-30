import h from '@satorijs/element'
import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import type { Bot, Feature, NeutralResource, SendOptions } from '@luckylillia/plugin-sdk'
import * as api from './api'
import { MessageEncoder } from './message'
import { decodeUser } from './utils'
import type { NormalizeHost, SatoriEvent } from '../../../../universal/types'

/** The logged-in QQ account, created once logged in. */
export class NTQQBot implements Bot, NormalizeHost {
  // Inherited from the Satori adapter, which downstream Satori clients key on
  readonly platform = 'llonebot'
  readonly selfId: string
  readonly sid: string
  // An account cannot send markdown or buttons; link cards it could, signed, but nothing builds them yet
  readonly features: readonly Feature[] = ['message.face', 'message.forward', 'message.proactive']
  status = Status.ONLINE
  private sn = 0

  constructor(readonly ctx: Context) {
    this.selfId = ctx.account.uin
    this.sid = `${this.platform}:${this.selfId}`
  }

  event(type: string, data: Partial<SatoriEvent>): SatoriEvent {
    const sn = ++this.sn
    return {
      // @ts-expect-error: the Satori adapter has always sent id alongside sn
      id: sn,
      sn,
      type,
      self_id: this.selfId,
      platform: this.platform,
      timestamp: Date.now(),
      // Non-login events only carry sn, user and platform of the login
      login: { sn: 1, user: decodeUser(this.ctx.account), platform: this.platform } as SatoriEvent['login'],
      ...data,
    }
  }

  async sendMessage(channelId: string, content: h.Fragment, options: SendOptions = {}): Promise<NeutralResource[]> {
    const elements = h.normalize(content)
    if (options.quote) elements.unshift(h('quote', { id: options.quote }))
    const outgoing = await this.ctx.bots.beforeSend(this, channelId, elements)
    if (!outgoing.length) return []
    return await new MessageEncoder(this.ctx, channelId).send(outgoing)
  }

  sendPrivateMessage(userId: string, content: h.Fragment, options?: SendOptions) {
    return this.sendMessage(`private:${userId}`, content, options)
  }

  async getMessage(channelId: string, messageId: string) {
    return await api.getMessage(this.ctx, messageId)
  }

  async deleteMessage(channelId: string, messageId: string) {
    await api.deleteMessage(this.ctx, messageId)
  }

  async getUser(userId: string) {
    return await api.getUser(this.ctx, userId)
  }

  async getGuild(guildId: string) {
    return await api.getGuild(this.ctx, guildId)
  }

  async getGuildMember(guildId: string, userId: string) {
    return await api.getGuildMember(this.ctx, guildId, userId)
  }

  async muteGuildMember(guildId: string, userId: string, duration: number) {
    await api.muteGuildMember(this.ctx, guildId, userId, duration)
  }

  async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
    await api.kickGuildMember(this.ctx, guildId, userId, permanent)
  }

  async createReaction(channelId: string, messageId: string, emoji: string) {
    await api.createReaction(this.ctx, messageId, emoji)
  }
}
