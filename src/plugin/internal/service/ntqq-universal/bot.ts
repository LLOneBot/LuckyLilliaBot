import h from '@satorijs/element'
import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import type { Bot, NeutralResource, SendOptions } from '@luckylillia/plugin-sdk'
import { selfInfo } from '@/common/globalVars'
import { MessageEncoder } from '../../adapter/satori/message'
import { decodeUser } from '../../adapter/satori/utils'
import { getMessage } from '../../adapter/satori/api/message/get'
import { deleteMessage } from '../../adapter/satori/api/message/delete'
import { getUser } from '../../adapter/satori/api/user/get'
import { getGuild } from '../../adapter/satori/api/guild/get'
import { getGuildMember } from '../../adapter/satori/api/member/get'
import { muteGuildMember } from '../../adapter/satori/api/member/mute'
import { kickGuildMember } from '../../adapter/satori/api/member/kick'
import { createReaction } from '../../adapter/satori/api/reaction/create'
import type { NormalizeHost, SatoriEvent } from '../../../../universal/types'

/** The logged-in QQ account, created once logged in. Capabilities reuse the Satori API handlers. */
export class NTQQBot implements Bot, NormalizeHost {
  // Inherited from the Satori adapter, which downstream Satori clients key on
  readonly platform = 'llonebot'
  readonly selfId = selfInfo.uin
  readonly sid = `${this.platform}:${this.selfId}`
  status = Status.ONLINE
  private sn = 0

  constructor(readonly ctx: Context) {}

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
      login: { sn: 1, user: decodeUser(selfInfo), platform: this.platform } as SatoriEvent['login'],
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
    return await getMessage(this.ctx, { channel_id: channelId, message_id: messageId })
  }

  async deleteMessage(channelId: string, messageId: string) {
    await deleteMessage(this.ctx, { channel_id: channelId, message_id: messageId })
  }

  async getUser(userId: string) {
    return await getUser(this.ctx, { user_id: userId })
  }

  async getGuild(guildId: string) {
    return await getGuild(this.ctx, { guild_id: guildId })
  }

  async getGuildMember(guildId: string, userId: string) {
    return await getGuildMember(this.ctx, { guild_id: guildId, user_id: userId })
  }

  async muteGuildMember(guildId: string, userId: string, duration: number) {
    await muteGuildMember(this.ctx, { guild_id: guildId, user_id: userId, duration })
  }

  async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
    await kickGuildMember(this.ctx, { guild_id: guildId, user_id: userId, permanent })
  }

  async createReaction(channelId: string, messageId: string, emoji: string) {
    await createReaction(this.ctx, { channel_id: channelId, message_id: messageId, emoji_id: emoji })
  }
}
