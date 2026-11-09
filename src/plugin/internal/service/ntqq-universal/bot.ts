import h from '@satorijs/element'
import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import type { Bot, Feature, NeutralList, NeutralResource, SendOptions } from '@luckylillia/plugin-sdk'
import type { SelfInfo } from '../../protocol/nt-protocol/ntqqapi/types'
import * as api from './api'
import { createInternal, type Internal } from './internal'
import { MessageEncoder } from './message'
import { decodeUser } from './utils'
import type { NormalizeHost, SatoriEvent } from '../../../../universal/types'

/**
 * The logged-in QQ account, created once logged in. The method names and argument order are Satori's
 * (`@satorijs/protocol` Methods), which the Satori adapter calls by name.
 */
export class NTQQBot implements Bot, NormalizeHost {
  // Satori clients see `llonebot`, the name from before: the Satori adapter renames it on the way out
  readonly platform = 'luckylillia'
  readonly selfId: string
  readonly sid: string
  // An account cannot send markdown or buttons; link cards it could, signed, but nothing builds them yet
  readonly features: readonly Feature[] = ['message.face', 'message.forward', 'message.proactive', 'guild.plain']
  status: Status
  /** What Satori has no method for: the OneBot 11 actions (internal.ts) */
  readonly internal: Internal
  private readonly selfInfo: SelfInfo
  private selfUser: NeutralResource
  private sn = 0

  constructor(readonly ctx: Context) {
    this.selfInfo = ctx.qqProtocol.selfInfo
    this.selfId = this.selfInfo.uin
    this.sid = `${this.platform}:${this.selfId}`
    this.status = this.selfInfo.online ? Status.ONLINE : Status.OFFLINE
    this.selfUser = decodeUser(this.selfInfo)
    this.internal = createInternal(ctx)
  }

  get user(): NeutralResource {
    // Logout clears the protocol record before this bot is removed; keep the old identity for that event.
    if (this.selfInfo.uin === this.selfId) this.selfUser = decodeUser(this.selfInfo)
    return this.selfUser
  }

  event(type: string, data: Partial<SatoriEvent>): SatoriEvent {
    return {
      sn: ++this.sn,
      type,
      self_id: this.selfId,
      platform: this.platform,
      timestamp: Date.now(),
      login: { sn: 1, user: this.user, platform: this.platform } as SatoriEvent['login'],
      referrer: undefined,
      ...data,
    }
  }

  async sendMessage(channelId: string, content: h.Fragment, options: SendOptions = {}): Promise<NeutralResource[]> {
    const elements = h.normalize(content)
    if (options.quote) elements.unshift(h('quote', { id: options.quote }))
    const outgoing = await this.ctx.bots.beforeSend(this, channelId, elements, options)
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

  async getMessageList(channelId: string, next?: string, direction?: string, limit?: number, order?: 'asc' | 'desc') {
    return await api.getMessageList(this.ctx, channelId, next, limit, order)
  }

  async getUser(userId: string) {
    return await api.getUser(this.ctx, userId)
  }

  async getFriendList(): Promise<NeutralList> {
    return await api.getFriendList(this.ctx)
  }

  async deleteFriend(userId: string) {
    await api.deleteFriend(this.ctx, userId)
  }

  async handleFriendRequest(messageId: string, approve: boolean) {
    await api.handleFriendRequest(this.ctx, messageId, approve)
  }

  async getGuild(guildId: string) {
    return await api.getGuild(this.ctx, guildId)
  }

  async getGuildList(): Promise<NeutralList> {
    return await api.getGuildList(this.ctx)
  }

  async handleGuildRequest(messageId: string, approve: boolean, comment?: string) {
    await api.handleGroupRequest(this.ctx, messageId, approve, comment)
  }

  async getChannel(channelId: string) {
    return await api.getChannel(this.ctx, channelId)
  }

  async getChannelList(guildId: string): Promise<NeutralList> {
    return { data: [await api.getChannel(this.ctx, guildId)] }
  }

  async createDirectChannel(userId: string) {
    return await api.getChannel(this.ctx, `private:${userId}`)
  }

  async updateChannel(channelId: string, data: { name?: string }) {
    await api.updateChannel(this.ctx, channelId, data)
  }

  async deleteChannel(channelId: string) {
    await api.deleteChannel(this.ctx, channelId)
  }

  async muteChannel(channelId: string, guildId?: string, enable?: boolean) {
    await api.muteChannel(this.ctx, channelId, enable)
  }

  async getGuildMember(guildId: string, userId: string) {
    return await api.getGuildMember(this.ctx, guildId, userId)
  }

  async getGuildMemberList(guildId: string): Promise<NeutralList> {
    return await api.getGuildMemberList(this.ctx, guildId)
  }

  async muteGuildMember(guildId: string, userId: string, duration: number) {
    await api.muteGuildMember(this.ctx, guildId, userId, duration)
  }

  async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
    await api.kickGuildMember(this.ctx, guildId, userId, permanent)
  }

  async handleGuildMemberRequest(messageId: string, approve: boolean, comment?: string) {
    await api.handleGroupRequest(this.ctx, messageId, approve, comment)
  }

  async getGuildRoleList(): Promise<NeutralList> {
    return api.getGuildRoleList()
  }

  async setGuildMemberRole(guildId: string, userId: string, roleId: string) {
    await api.setGuildMemberRole(this.ctx, guildId, userId, roleId)
  }

  async unsetGuildMemberRole(guildId: string, userId: string, roleId: string) {
    await api.setGuildMemberRole(this.ctx, guildId, userId, roleId, false)
  }

  async createReaction(channelId: string, messageId: string, emoji: string) {
    await api.createReaction(this.ctx, messageId, emoji)
  }

  async deleteReaction(channelId: string, messageId: string, emoji: string) {
    await api.deleteReaction(this.ctx, messageId, emoji)
  }

  async getReactionList(channelId: string, messageId: string, emoji: string, next?: string): Promise<NeutralList> {
    return await api.getReactionList(this.ctx, messageId, emoji, next)
  }
}
