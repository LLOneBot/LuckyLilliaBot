import h from '@satorijs/element'
import { Channel, Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import type { Bot, NeutralResource, SendOptions } from '@luckylillia/plugin-sdk'
import type { QQOfficialConfig } from '@/common/types'
import type { SatoriEvent } from '../../../../universal/types'
import { ApiError, QQOfficialApi } from './api'
import { decodeChannel, decodeGuild, decodeGuildMember, DecodeHost, GuildDecodeHost, privateChannel, privateTarget } from './decode'
import { escapeMarkdown } from './elements'
import { GroupInternal, groupInternal, GuildInternal, guildInternal } from './internal'
import { loadMedia } from './media'
import { MenuCommand, MenuManager } from './menu'
import { PassiveReplies, ReplyContext } from './passive'
import { GuildMessageSender, MessageSender, PassiveOverride } from './sender'
import { StreamStates } from './stream'
import { ChannelSendRequest, GroupMember, MessageAudited, MessageType, SendRequest, SendResponse } from './types'
import type { UserNames } from './users'

/** Same msg_id and msg_seq as an earlier reply: retry with the next msg_seq */
const DUPLICATE = 40054005
/** The cited message or event can take no more replies: expired, used up or unknown */
const PASSIVE_REFUSED = new Set([304103, 40034005, 40034024, 40034025, 40034026, 40034027, 40034128])
/** A guild proactive message went to audit */
const UNDER_AUDIT = 304023
/** How long a send waits for the audit of its message */
const AUDIT_TIMEOUT = 5 * 60_000

export interface DeliverOptions {
  quote?: string
  /** The message as Satori markup, for the returned resource */
  markup?: string
  passive?: PassiveOverride
  /** Plain text the stream setting turns into a streamed markdown reply */
  streamText?: boolean
  /** A custom payload asked for its stream fields to be filled in */
  autoStream?: boolean
}

/** Sends that went to audit wait here for MESSAGE_AUDIT_PASS / MESSAGE_AUDIT_REJECT. */
export class Audits {
  private pending = new Map<string, (result: MessageAudited | undefined) => void>()

  constructor(private ctx: Context) {}

  wait(auditId: string, timeout = AUDIT_TIMEOUT): Promise<MessageAudited | undefined> {
    return new Promise((resolve) => {
      const dispose = this.ctx.timeout(() => settle(undefined), timeout)
      const settle = (result: MessageAudited | undefined) => {
        dispose()
        this.pending.delete(auditId)
        resolve(result)
      }
      this.pending.set(auditId, settle)
    })
  }

  /** A rejected message has no id; its send resolves without one. */
  settle(passed: boolean, data: MessageAudited) {
    this.pending.get(data.audit_id)?.(passed ? data : undefined)
  }
}

function resource(bot: { user: object }, channelId: string, direct: boolean, content: string, id?: string, timestamp?: string): NeutralResource {
  const created = timestamp ? Date.parse(timestamp) : NaN
  return {
    id,
    content,
    channel: { id: channelId, type: direct ? Channel.Type.DIRECT : Channel.Type.TEXT },
    user: bot.user,
    created_at: Number.isNaN(created) ? Date.now() : created,
  }
}

/** A QQ open platform bot (q.qq.com) in groups and C2C, identified by its AppID. */
export class QQOfficialBot implements Bot, DecodeHost {
  readonly platform = 'qq'
  readonly sid: string
  status: Status = Status.OFFLINE
  readonly user: { id: string; name?: string; avatar?: string }
  readonly passive = new PassiveReplies()
  readonly streams = new StreamStates()
  /** Every group / C2C endpoint, for what the methods here do not cover */
  readonly internal: GroupInternal
  readonly menu: MenuManager
  guildBot?: QQGuildBot
  botOpenid?: string
  private joinRequests = new Map<string, { group: string; member: string }>()
  private initialized = false
  private sn = 0

  constructor(
    readonly ctx: Context,
    readonly api: QQOfficialApi,
    readonly config: QQOfficialConfig,
    readonly names: UserNames,
    readonly audits: Audits,
  ) {
    this.selfId = config.appId
    this.sid = `${this.platform}:${this.selfId}`
    this.user = { id: this.selfId }
    this.internal = groupInternal(api)
    // Join requests listed by a plugin can be answered by their id too
    const list = this.internal.getJoinRequestList
    this.internal.getJoinRequestList = async (group, params) => {
      const result = await list(group, params)
      for (const item of result?.list ?? []) this.registerJoinRequest(item.join_request_id, group, item.member_openid)
      return result
    }
    this.menu = new MenuManager(ctx, this.internal, config)
  }

  readonly selfId: string

  event(type: string, data: Partial<SatoriEvent>): SatoriEvent {
    const sn = ++this.sn
    return {
      sn,
      type,
      self_id: this.selfId,
      platform: this.platform,
      timestamp: Date.now(),
      login: { sn: 1, user: this.user, platform: this.platform } as SatoriEvent['login'],
      referrer: undefined,
      ...data,
    }
  }

  setStatus(status: Status) {
    if (this.status === status) return
    this.status = status
    this.ctx.parallel('bot/status', this).catch(e => this.ctx.logger('qq-official').warn(e))
    if (this.guildBot) this.ctx.parallel('bot/status', this.guildBot).catch(e => this.ctx.logger('qq-official').warn(e))
  }

  /** After READY: the bot's own profile, then the menus, once. */
  async initialize() {
    const logger = this.ctx.logger('qq-official')
    try {
      const me = await guildInternal(this.api).getMe()
      if (me?.username) this.user.name = me.username
      if (me?.avatar) this.user.avatar = me.avatar
      // Koishi adapter-qq-crack falls back to it for mentions of the bot
      if (me?.union_openid) this.botOpenid ??= me.union_openid
    } catch (e) {
      logger.warn('获取机器人资料失败: %s', (e as Error).message)
    }
    if (this.initialized) return
    this.initialized = true
    await this.menu.sync()
  }

  async sendMessage(channelId: string, content: h.Fragment, options: SendOptions = {}): Promise<NeutralResource[]> {
    const elements = h.normalize(content)
    if (options.quote) elements.unshift(h('quote', { id: options.quote }))
    const outgoing = await this.ctx.bots.beforeSend(this, channelId, elements)
    if (!outgoing.length) return []
    return await new MessageSender(this, channelId).send(outgoing)
  }

  sendPrivateMessage(userId: string, content: h.Fragment, options?: SendOptions) {
    return this.sendMessage(privateChannel(userId), content, options)
  }

  async deleteMessage(channelId: string, messageId: string) {
    await this.api.request('DELETE', `${this.target(channelId)}/messages/${encodeURIComponent(messageId)}`)
  }

  /** The API path of a channel: a group, or the user of a `private:` channel. */
  target(channelId: string): string {
    const openid = privateTarget(channelId)
    return openid ? `/v2/users/${encodeURIComponent(openid)}` : `/v2/groups/${encodeURIComponent(channelId)}`
  }

  createDirectChannel(userId: string) {
    return Promise.resolve({ id: privateChannel(userId), type: Channel.Type.DIRECT })
  }

  /** What is known of a user: the name seen last, else what the lookup service (if any) says. */
  async getUser(userId: string): Promise<NeutralResource> {
    let name = this.names.get(this.platform, userId)
    let avatar: string | undefined
    if (!name) {
      const info = await this.names.lookup(userId)
      name = info?.name
      avatar = info?.avatar
      this.names.set(this.platform, userId, name)
    }
    return { id: userId, name, avatar: avatar ?? `https://q.qlogo.cn/qqapp/${this.selfId}/${userId}/640` }
  }

  async getGuild(guildId: string): Promise<NeutralResource> {
    const openid = privateTarget(guildId)
    if (openid) {
      const user = await this.getUser(openid)
      return { id: guildId, name: user.name ?? openid, avatar: user.avatar }
    }
    const group = await this.internal.getGroupInfo(guildId)
    return { id: group.group_openid ?? guildId, name: group.group_name }
  }

  async getChannel(channelId: string): Promise<NeutralResource> {
    const openid = privateTarget(channelId)
    if (openid) {
      const user = await this.getUser(openid)
      return { id: channelId, type: Channel.Type.DIRECT, name: user.name ?? openid }
    }
    const group = await this.internal.getGroupInfo(channelId)
    return { id: group.group_openid ?? channelId, type: Channel.Type.TEXT, name: group.group_name }
  }

  async getChannelList(guildId: string): Promise<{ data: NeutralResource[] }> {
    return { data: [await this.getChannel(guildId)] }
  }

  async getGuildMember(guildId: string, userId: string): Promise<NeutralResource> {
    return this.decodeMember(await this.internal.getGroupMember(guildId, userId))
  }

  async getGuildMemberList(guildId: string, next?: string): Promise<{ data: NeutralResource[]; next?: string }> {
    const page = await this.internal.getGroupMembers(guildId, next ? { cursor: next } : undefined)
    return { data: (page?.members ?? []).map(member => this.decodeMember(member)), next: page?.next_cursor || undefined }
  }

  /** `permanent` also puts the member on the group's blacklist. */
  async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
    await this.internal.batchRemoveGroupMembers(guildId, { member_openids: [userId], add_to_member_blacklist: !!permanent })
  }

  /** `duration` in ms; 0 lifts the mute. */
  async muteGuildMember(guildId: string, userId: string, duration: number) {
    const op = duration <= 0 ? 'del' as const : await this.muteOp(guildId, userId)
    await this.internal.setRestrictChatSetting(guildId, {
      members: [{
        op,
        member_openid: userId,
        mute_expire_at: duration > 0 ? new Date(Date.now() + duration).toISOString() : '',
      }],
    })
  }

  /** Answers a guild-member-request event, by its message id. */
  async handleGuildMemberRequest(messageId: string, approve: boolean, comment?: string) {
    const request = this.joinRequests.get(messageId)
    if (!request) throw new Error(`没有这个入群申请: ${messageId}`)
    await this.internal.approveJoinRequest(request.group, request.member, {
      op: approve ? 'approve' : 'decline',
      join_request_id: messageId,
      reject_reason: approve ? undefined : comment,
      add_to_member_blacklist: false,
    })
    this.joinRequests.delete(messageId)
  }

  registerJoinRequest(requestId: string, group: string, member: string) {
    this.joinRequests.delete(requestId)
    this.joinRequests.set(requestId, { group, member })
    while (this.joinRequests.size > 1000) this.joinRequests.delete(this.joinRequests.keys().next().value!)
  }

  /** The bot's own place in a group: its role, whether it may send proactively, what messages it gets. */
  async refreshBotGroupState(guildId: string) {
    const state = await this.internal.getBotGroupState(guildId)
    if (state?.member_role) (this.user as { role?: string }).role = state.member_role
    return state
  }

  /** Commands of a command framework, for the C2C menu / group panel when they are set to follow them. */
  updateCommands(commands: MenuCommand[]) {
    return this.menu.updateCommands(commands)
  }

  /**
   * Sends one platform message, as a passive reply when possible: to the quoted message if it can still take
   * one, else to the latest message or event in the channel; with nothing left to cite it goes out proactively.
   */
  async deliver(channelId: string, body: SendRequest, options: DeliverOptions = {}): Promise<NeutralResource> {
    const direct = privateTarget(channelId) !== undefined
    const ref = options.quote && this.passive.refOf(options.quote)
    if (ref && !body.message_reference) body = { ...body, message_reference: { message_id: ref } }
    let context = this.pinned(channelId, options.passive) ?? this.passive.pick(channelId, options.quote)
    let retried = false
    for (let attempt = 0; ; attempt++) {
      let request: SendRequest = { ...body, ...(context ? this.passive.claim(context) : {}) }
      const key = context?.id
      if (options.streamText && key && request.msg_type === MessageType.Text) {
        request = { ...request, msg_type: MessageType.Markdown, markdown: { content: escapeMarkdown(request.content ?? '') || ' ' } }
        delete request.content
      }
      if (options.streamText || options.autoStream) this.streams.apply(key, request, !!key)
      else if (!request.stream) this.streams.clear(key)
      // Rich media cannot reply to an event (found by koishi-plugin-adapter-qq-crack)
      if (request.event_id && request.msg_type === MessageType.Media) {
        delete request.event_id
        delete request.msg_seq
      }
      try {
        const res = await this.api.request<SendResponse>('POST', `${this.target(channelId)}/messages`, request)
        let id = res?.id
        if (res?.audit_id && !id) id = (await this.audited(res.audit_id))?.message_id
        if (id && res?.ext_info?.ref_idx) this.passive.rememberRef(id, res.ext_info.ref_idx)
        this.streams.update(key, request, id)
        return resource(this, channelId, direct, options.markup ?? body.content ?? '', id, res?.timestamp)
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        if (!retried && e.code !== undefined && this.config.retryWhen.includes(e.code)) {
          retried = true
          continue
        }
        if (!context || attempt >= 2) throw e
        if (e.code === DUPLICATE) continue
        if (!PASSIVE_REFUSED.has(e.code!)) throw e
        this.passive.exhaust(context)
        context = this.passive.pick(channelId)
      }
    }
  }

  private async audited(auditId: string) {
    if (!this.config.intents.includes('MESSAGE_AUDIT')) return
    return this.audits.wait(auditId)
  }

  /** The context a `<passive>` element names, known or not. */
  private pinned(channelId: string, passive: PassiveOverride | undefined): ReplyContext | undefined {
    const id = passive?.messageId ?? passive?.eventId
    if (!id) return
    const scope = privateTarget(channelId) === undefined ? 'group' : 'c2c'
    this.passive.remember({ id, kind: passive!.messageId ? 'message' : 'event', scope, channelId, at: Date.now() })
    const context = this.passive.find(id)
    if (context && passive!.seq) context.seq = passive!.seq - 1
    return context
  }

  private async muteOp(guildId: string, userId: string): Promise<'add' | 'update'> {
    try {
      const setting = await this.internal.getRestrictChatSetting(guildId)
      return setting?.members?.some(member => member.member_openid === userId) ? 'update' : 'add'
    } catch {
      return 'add'
    }
  }

  private decodeMember(member: GroupMember): NeutralResource {
    const name = member.username ?? this.names.get(this.platform, member.member_openid)
    if (member.username) this.names.set(this.platform, member.member_openid, member.username)
    return {
      user: {
        id: member.member_openid,
        name,
        avatar: `https://q.qlogo.cn/qqapp/${this.selfId}/${member.member_openid}/640`,
        is_bot: member.bot,
      },
      nick: name,
      roles: member.member_role ? [{ id: member.member_role, name: member.member_role }] : [],
      joined_at: member.joined_at ? Date.parse(member.joined_at) : undefined,
    }
  }
}

/** Guilds take a channel id as it is; their DMs a `<dm guild>_<dm channel>` id. */
function assertGuildChannel(channelId: string, method: string) {
  if (privateTarget(channelId) !== undefined) throw new Error(`${method} 只支持子频道，不支持单聊 ${channelId}`)
  if (channelId.includes('_')) throw new Error(`${method} 只支持子频道，不支持频道私信 ${channelId}`)
}

export interface GuildDeliverOptions extends DeliverOptions {
  /** A local image, sent as multipart */
  file?: { data: Buffer; name: string }
  /** A remote image, for the platform to fetch */
  fileUrl?: string
}

/**
 * The guilds (QQ 频道) of the same AppID, as a bot of their own platform `qqguild`, the way Koishi's QQ adapters
 * split them: guild ids, channels, members and messages share nothing with groups. A `private:` channel is still
 * a C2C chat, handed to the `qq` bot.
 */
export class QQGuildBot implements Bot, GuildDecodeHost {
  readonly platform = 'qqguild'
  readonly selfId: string
  readonly sid: string
  readonly passive = new PassiveReplies()
  readonly internal: GuildInternal
  /** The bot's user id in guilds, from READY */
  guildUserId?: string
  private sn = 0

  constructor(readonly parent: QQOfficialBot) {
    this.selfId = parent.selfId
    this.sid = `${this.platform}:${this.selfId}`
    this.internal = guildInternal(parent.api)
    parent.guildBot = this
  }

  get status() {
    return this.parent.status
  }

  get user() {
    return this.parent.user
  }

  get ctx() {
    return this.parent.ctx
  }

  get config() {
    return this.parent.config
  }

  get names() {
    return this.parent.names
  }

  event(type: string, data: Partial<SatoriEvent>): SatoriEvent {
    const sn = ++this.sn
    return {
      sn,
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
    if (privateTarget(channelId) !== undefined) return this.parent.sendMessage(channelId, content, options)
    const elements = h.normalize(content)
    if (options.quote) elements.unshift(h('quote', { id: options.quote }))
    const outgoing = await this.ctx.bots.beforeSend(this, channelId, elements)
    if (!outgoing.length) return []
    return await new GuildMessageSender(this, channelId).send(outgoing)
  }

  /** A DM opens a session first; `guildId` is the guild the user is reached through. */
  async sendPrivateMessage(userId: string, content: h.Fragment, options?: SendOptions & { guildId?: string }) {
    const channel = await this.createDirectChannel(userId, options?.guildId)
    return this.sendMessage(channel.id, content, options)
  }

  async createDirectChannel(userId: string, guildId?: string) {
    // Called from a DM channel: its source guild is the part before the underscore
    const source = guildId?.includes('_') ? guildId.split('_')[0] : guildId
    const dms = await this.internal.createDMS({ recipient_id: userId, source_guild_id: source })
    return { id: `${dms.guild_id}_${source}`, type: Channel.Type.DIRECT }
  }

  async getMessage(channelId: string, messageId: string): Promise<NeutralResource> {
    const { message } = await this.internal.getMessage(channelId, messageId)
    return {
      id: message.id,
      content: message.content ?? '',
      user: message.author ? { id: message.author.id, name: message.author.username, avatar: message.author.avatar } : undefined,
      channel: { id: message.channel_id, type: Channel.Type.TEXT },
      guild: { id: message.guild_id },
      created_at: Date.parse(message.timestamp) || undefined,
    }
  }

  async deleteMessage(channelId: string, messageId: string) {
    if (privateTarget(channelId) !== undefined) return this.parent.deleteMessage(channelId, messageId)
    if (channelId.includes('_')) {
      await this.internal.deleteDM(channelId.split('_')[0], messageId)
    } else {
      await this.internal.deleteMessage(channelId, messageId)
    }
  }

  async getUser(userId: string, guildId?: string): Promise<NeutralResource> {
    if (!guildId) return { id: userId, name: this.names.get(this.platform, userId) }
    const member = await this.getGuildMember(guildId, userId)
    return member.user ?? { id: userId }
  }

  async getGuildList(next?: string): Promise<{ data: NeutralResource[]; next?: string }> {
    const limit = 100
    const guilds = await this.internal.getGuilds({ ...(next ? { after: next } : {}), limit })
    return { data: guilds.map(decodeGuild), next: guilds.length === limit ? guilds[guilds.length - 1].id : undefined }
  }

  async getGuild(guildId: string): Promise<NeutralResource> {
    if (privateTarget(guildId) !== undefined) return this.parent.getGuild(guildId)
    return decodeGuild(await this.internal.getGuild(guildId))
  }

  async getChannelList(guildId: string): Promise<{ data: NeutralResource[] }> {
    if (privateTarget(guildId) !== undefined) return this.parent.getChannelList(guildId)
    return { data: (await this.internal.getChannels(guildId)).map(decodeChannel) }
  }

  async getChannel(channelId: string): Promise<NeutralResource> {
    if (privateTarget(channelId) !== undefined) return this.parent.getChannel(channelId)
    return decodeChannel(await this.internal.getChannel(channelId))
  }

  async createChannel(guildId: string, data: Record<string, any>): Promise<NeutralResource> {
    const type = data.type === Channel.Type.CATEGORY ? 4 : data.type === Channel.Type.VOICE ? 2 : 0
    const channel = await this.internal.createGuildChannel(guildId, {
      name: data.name,
      type,
      parent_id: data.parentId ?? data.parent_id,
      position: data.position,
      sub_type: data.sub_type ?? 0,
      private_type: data.private_type ?? 0,
      speak_permission: data.speak_permission ?? 1,
      private_user_ids: data.private_user_ids ?? [],
      application_id: data.application_id,
    })
    return decodeChannel(channel)
  }

  async updateChannel(channelId: string, data: Record<string, any>) {
    assertGuildChannel(channelId, 'updateChannel')
    await this.internal.modifyChannel(channelId, {
      name: data.name,
      position: data.position,
      parent_id: data.parentId ?? data.parent_id,
      private_type: data.private_type,
      speak_permission: data.speak_permission,
    })
  }

  async deleteChannel(channelId: string) {
    assertGuildChannel(channelId, 'deleteChannel')
    await this.internal.deleteChannel(channelId)
  }

  /** QQ has no per-channel mute: this mutes the whole guild (30 days), `enable` false lifts it. */
  async muteChannel(channelId: string, guildId?: string, enable = true) {
    assertGuildChannel(channelId, 'muteChannel')
    const target = guildId ?? (await this.internal.getChannel(channelId)).guild_id
    await this.internal.muteGuildOrMembers(target, { mute_seconds: enable ? '2592000' : '0' })
  }

  async getChannelOnlineNums(channelId: string): Promise<number> {
    assertGuildChannel(channelId, 'getChannelOnlineNums')
    return (await this.internal.getChannelOnlineNums(channelId)).online_nums
  }

  async getChannelUserPermissions(channelId: string, userId: string) {
    assertGuildChannel(channelId, 'getChannelUserPermissions')
    return this.internal.getChannelMemberPermissions(channelId, userId)
  }

  async setChannelUserPermissions(channelId: string, userId: string, data: { add?: string; remove?: string }) {
    assertGuildChannel(channelId, 'setChannelUserPermissions')
    await this.internal.modifyChannelMemberPermissions(channelId, userId, data)
  }

  async getChannelRolePermissions(channelId: string, roleId: string) {
    assertGuildChannel(channelId, 'getChannelRolePermissions')
    return this.internal.getChannelRole(channelId, roleId)
  }

  async setChannelRolePermissions(channelId: string, roleId: string, data: { add?: string; remove?: string }) {
    assertGuildChannel(channelId, 'setChannelRolePermissions')
    await this.internal.modifyChannelRole(channelId, roleId, data)
  }

  async setChannelMic(channelId: string) {
    assertGuildChannel(channelId, 'setChannelMic')
    await this.internal.setChannelMic(channelId)
  }

  async removeChannelMic(channelId: string) {
    assertGuildChannel(channelId, 'removeChannelMic')
    await this.internal.removeChannelMic(channelId)
  }

  /** status: 0 play `audio_url`, 1 pause, 2 resume, 3 stop */
  async controlChannelAudio(channelId: string, data: { status: number; audio_url?: string; text?: string }) {
    assertGuildChannel(channelId, 'controlChannelAudio')
    await this.internal.controlChannelAudio(channelId, data)
  }

  async getGuildMemberList(guildId: string, next?: string): Promise<{ data: NeutralResource[]; next?: string }> {
    const members = await this.internal.getGuildMembers(guildId, { limit: 400, ...(next ? { after: next } : {}) })
    return { data: members.map(member => decodeGuildMember(this, member)), next: members[members.length - 1]?.user?.id }
  }

  async getGuildMember(guildId: string, userId: string): Promise<NeutralResource> {
    return decodeGuildMember(this, await this.internal.getGuildMember(guildId, userId))
  }

  async kickGuildMember(guildId: string, userId: string) {
    await this.internal.removeGuildMember(guildId, userId)
  }

  /** `duration` in ms; 0 lifts the mute. */
  async muteGuildMember(guildId: string, userId: string, duration: number) {
    await this.internal.muteGuildMember(guildId, userId, { mute_seconds: Math.floor(duration / 1000) })
  }

  /** `emoji` is `<type>:<id>`, as reaction events report it. */
  async createReaction(channelId: string, messageId: string, emoji: string) {
    const [type, id] = emoji.split(':')
    await this.internal.createReaction(channelId, messageId, type, id)
  }

  async deleteReaction(channelId: string, messageId: string, emoji: string) {
    const [type, id] = emoji.split(':')
    await this.internal.deleteReaction(channelId, messageId, type, id)
  }

  async getReactionList(channelId: string, messageId: string, emoji: string, next?: string): Promise<{ data: NeutralResource[]; next?: string }> {
    const [type, id] = emoji.split(':')
    const { users, cookie } = await this.internal.getReactions(channelId, messageId, type, id, { limit: 50, ...(next ? { cookie: next } : {}) })
    return { data: (users ?? []).map((user: { id: string; username?: string; avatar?: string }) => ({ id: user.id, name: user.username, avatar: user.avatar })), next: cookie || undefined }
  }

  /**
   * One guild message, citing the latest message of the channel within its window when there is one. A local
   * image goes as multipart, a remote one by URL; a message under audit resolves once the audit is through.
   */
  async deliver(channelId: string, data: ChannelSendRequest, options: GuildDeliverOptions = {}): Promise<NeutralResource> {
    const direct = channelId.includes('_')
    const path = direct ? `/dms/${encodeURIComponent(channelId.split('_')[0])}/messages` : `/channels/${encodeURIComponent(channelId)}/messages`
    let body: ChannelSendRequest = { ...data }
    if (options.quote && !body.message_reference) body.message_reference = { message_id: options.quote }
    const context = options.passive?.messageId ? undefined : this.passive.pick(channelId, options.quote)
    const msgId = options.passive?.messageId ?? context?.id
    if (msgId) body.msg_id = msgId
    if (options.passive?.eventId) body.event_id = options.passive.eventId
    const key = msgId ?? body.event_id
    if (options.streamText && key && !body.markdown) {
      body = { ...body, msg_type: MessageType.Markdown, markdown: { content: escapeMarkdown(body.content ?? '') || ' ' } }
      delete body.content
    }
    // The platform documents no streaming for guilds: only when switched on, even for an explicit stream
    const streaming = this.config.autoStreamText.includes('guild')
    if (!streaming) delete body.stream
    if (streaming && (options.streamText || options.autoStream)) this.parent.streams.apply(key, body, !!key)
    else if (!body.stream) this.parent.streams.clear(key)
    if (typeof body.content === 'string' && !body.content.trim()) delete body.content
    if (body.keyboard) body.bot_appid = this.selfId

    let file = options.file
    let fileUrl = options.fileUrl
    for (let retried = false; ; retried = true) {
      let res: SendResponse
      try {
        if (file) {
          const form = new FormData()
          if (body.content) form.append('content', body.content)
          if (body.msg_id) form.append('msg_id', body.msg_id)
          if (body.event_id) form.append('event_id', body.event_id)
          form.append('file_image', new Blob([new Uint8Array(file.data)]), file.name)
          res = await this.parent.api.request<SendResponse>('POST', path, undefined, { form })
        } else {
          res = await this.parent.api.request<SendResponse>('POST', path, fileUrl ? { ...body, image: fileUrl } : body)
        }
      } catch (e) {
        // An image the platform could not fetch goes again as bytes
        if (!retried && fileUrl && e instanceof ApiError && e.code !== undefined && this.config.retryWhen.includes(e.code)) {
          file = await loadMedia(fileUrl)
          fileUrl = undefined
          continue
        }
        throw e
      }
      let id = res?.id
      let timestamp = res?.timestamp
      const auditId = res?.code === UNDER_AUDIT ? res.data?.message_audit?.audit_id : res?.audit_id
      if (!id && auditId && this.config.intents.includes('MESSAGE_AUDIT')) {
        const audited = await this.parent.audits.wait(auditId)
        id = audited?.message_id
        timestamp = audited?.create_time || audited?.audit_time
      }
      this.parent.streams.update(key, body, id)
      return resource(this, channelId, direct, options.markup ?? data.content ?? '', id, timestamp)
    }
  }
}
