import h from '@satorijs/element'
import { Channel } from '@satorijs/protocol'
import type { SatoriEvent } from '../../../../universal/types'
import type { PassiveReplies } from './passive'
import type { UserNames } from './users'
import {
  Attachment, ChatType, ChannelType, GatewayPayload, GroupEvent, GroupMemberEvent, Guild, GuildChannel, GuildMember,
  GuildMessage, Interaction, JoinRequest, Mention, MessageDeletion, MessageElement, MessageReaction, User, UserEvent,
  UserMessage,
} from './types'

export interface DecodeHost {
  readonly selfId: string
  readonly passive: PassiveReplies
  /** How the platform names the bot in mentions; learned from the first mention flagged `is_you` */
  botOpenid?: string
  /** Names seen before, for the events that come without one */
  readonly names?: UserNames
  event(type: string, data: Partial<SatoriEvent>): SatoriEvent
  /** Join requests are answered by their id alone, so where each came from is kept */
  registerJoinRequest?(requestId: string, groupOpenid: string, memberOpenid: string): void
}

export interface GuildDecodeHost {
  readonly selfId: string
  readonly passive: PassiveReplies
  /** The bot's user id in guilds, as READY reports it */
  guildUserId?: string
  readonly names?: UserNames
  event(type: string, data: Partial<SatoriEvent>): SatoriEvent
}

export interface GuildDecodeOptions {
  /** A private bot with every guild message subscribed gets each @ message twice */
  skipAtMessages?: boolean
}

const PRIVATE_PREFIX = 'private:'

export const privateChannel = (openid: string) => PRIVATE_PREFIX + openid

/** The openid of a `private:` channel, or undefined for a group. */
export function privateTarget(channelId: string): string | undefined {
  return channelId.startsWith(PRIVATE_PREFIX) ? channelId.slice(PRIVATE_PREFIX.length) : undefined
}

/** Events of groups, C2C and the bot itself, which the `qq` bot reports; the rest belong to guilds. */
export const GROUP_EVENTS = new Set([
  'GROUP_AT_MESSAGE_CREATE', 'GROUP_MESSAGE_CREATE', 'C2C_MESSAGE_CREATE', 'GROUP_ADD_ROBOT', 'GROUP_DEL_ROBOT',
  'FRIEND_ADD', 'FRIEND_DEL', 'GROUP_MSG_RECEIVE', 'GROUP_MSG_REJECT', 'C2C_MSG_RECEIVE', 'C2C_MSG_REJECT',
  'GROUP_MEMBER_ADD', 'GROUP_MEMBER_UPDATE', 'GROUP_MEMBER_REMOVE', 'GROUP_JOIN_REQUEST',
])

/** Whether an INTERACTION_CREATE comes from a guild */
export const isGuildInteraction = (payload: GatewayPayload) => (payload.d as Interaction | undefined)?.chat_type === ChatType.Channel

export function decodeDispatch(host: DecodeHost, payload: GatewayPayload): SatoriEvent | undefined {
  switch (payload.t) {
    case 'GROUP_AT_MESSAGE_CREATE':
      return decodeGroupMessage(host, payload.d, true)
    case 'GROUP_MESSAGE_CREATE':
      return decodeGroupMessage(host, payload.d, false)
    case 'C2C_MESSAGE_CREATE':
      return decodePrivateMessage(host, payload.d)
    case 'GROUP_ADD_ROBOT':
    case 'GROUP_DEL_ROBOT': {
      const data: GroupEvent = payload.d
      const added = payload.t === 'GROUP_ADD_ROBOT'
      // A welcome message replies to this event
      if (added) rememberEvent(host, payload, 'group', data.group_openid, data.timestamp)
      return host.event(added ? 'guild-added' : 'guild-removed', {
        guild: { id: data.group_openid },
        channel: { id: data.group_openid, type: Channel.Type.TEXT },
        operator: data.op_member_openid ? { id: data.op_member_openid } : undefined,
      })
    }
    case 'GROUP_MSG_RECEIVE':
    case 'GROUP_MSG_REJECT': {
      const data: GroupEvent = payload.d
      const receive = payload.t === 'GROUP_MSG_RECEIVE'
      if (receive) rememberEvent(host, payload, 'group', data.group_openid, data.timestamp)
      return host.event(receive ? 'group-msg-receive' : 'group-msg-reject', {
        guild: { id: data.group_openid },
        channel: { id: data.group_openid, type: Channel.Type.TEXT },
        operator: data.op_member_openid ? { id: data.op_member_openid } : undefined,
      })
    }
    case 'FRIEND_ADD':
    case 'FRIEND_DEL': {
      const data: UserEvent = payload.d
      const added = payload.t === 'FRIEND_ADD'
      const channelId = privateChannel(data.openid)
      if (added) rememberEvent(host, payload, 'c2c', channelId, data.timestamp)
      return host.event(added ? 'friend-added' : 'friend-deleted', {
        user: decodeUser(host, data.openid),
        channel: { id: channelId, type: Channel.Type.DIRECT },
      })
    }
    case 'C2C_MSG_RECEIVE': {
      // Nothing for plugins beyond the internal event, but a reply may cite it
      const data: UserEvent = payload.d
      rememberEvent(host, payload, 'c2c', privateChannel(data.openid), data.timestamp)
      return
    }
    case 'GROUP_MEMBER_ADD':
    case 'GROUP_MEMBER_UPDATE':
    case 'GROUP_MEMBER_REMOVE':
      return decodeGroupMember(host, payload)
    case 'GROUP_JOIN_REQUEST':
      return decodeJoinRequest(host, payload.d)
    case 'INTERACTION_CREATE':
      return decodeInteraction(host, payload)
  }
}

export function decodeGuildDispatch(host: GuildDecodeHost, payload: GatewayPayload, options: GuildDecodeOptions = {}): SatoriEvent | undefined {
  switch (payload.t) {
    case 'AT_MESSAGE_CREATE':
      if (options.skipAtMessages) return
      return decodeGuildMessage(host, payload.d)
    case 'MESSAGE_CREATE':
    case 'DIRECT_MESSAGE_CREATE':
      return decodeGuildMessage(host, payload.d)
    case 'MESSAGE_DELETE':
    case 'PUBLIC_MESSAGE_DELETE':
    case 'DIRECT_MESSAGE_DELETE':
      if (payload.t === 'PUBLIC_MESSAGE_DELETE' && options.skipAtMessages) return
      return decodeDeletion(host, payload.d)
    case 'MESSAGE_REACTION_ADD':
    case 'MESSAGE_REACTION_REMOVE': {
      const data: MessageReaction = payload.d
      // Reactions to posts and comments of forums have no message to point at
      if (data.target?.type !== 'ReactionTargetType_MSG' && data.target?.type !== 0) return
      return host.event(payload.t === 'MESSAGE_REACTION_ADD' ? 'reaction-added' : 'reaction-removed', {
        message: { id: data.target.id, content: `${data.emoji.type}:${data.emoji.id}` },
        user: guildUser(host, { id: data.user_id }),
        channel: { id: data.channel_id, type: Channel.Type.TEXT },
        guild: { id: data.guild_id },
      })
    }
    case 'CHANNEL_CREATE':
    case 'CHANNEL_UPDATE':
    case 'CHANNEL_DELETE': {
      const data: GuildChannel = payload.d
      const type = { CHANNEL_CREATE: 'channel-added', CHANNEL_UPDATE: 'channel-updated', CHANNEL_DELETE: 'channel-deleted' }[payload.t]
      return host.event(type, {
        guild: { id: data.guild_id },
        channel: decodeChannel(data),
        operator: data.op_user_id ? { id: data.op_user_id } : undefined,
      })
    }
    case 'GUILD_CREATE':
    case 'GUILD_UPDATE':
    case 'GUILD_DELETE': {
      const data: Guild = payload.d
      const type = { GUILD_CREATE: 'guild-added', GUILD_UPDATE: 'guild-updated', GUILD_DELETE: 'guild-deleted' }[payload.t]
      return host.event(type, {
        guild: decodeGuild(data),
        operator: data.op_user_id ? { id: data.op_user_id } : undefined,
      })
    }
    case 'GUILD_MEMBER_ADD':
    case 'GUILD_MEMBER_UPDATE':
    case 'GUILD_MEMBER_REMOVE':
    // Koishi adapter-qq-crack spells it this way
    case 'GUILD_MEMBER_DELETE': {
      const data: GuildMember = payload.d
      const type = payload.t === 'GUILD_MEMBER_ADD' ? 'guild-member-added'
        : payload.t === 'GUILD_MEMBER_UPDATE' ? 'guild-member-updated' : 'guild-member-removed'
      const member = decodeGuildMember(host, data)
      return host.event(type, {
        guild: { id: data.guild_id ?? '' },
        member,
        user: member.user,
        operator: data.op_user_id ? { id: data.op_user_id } : undefined,
      })
    }
    case 'INTERACTION_CREATE': {
      const data: Interaction = payload.d
      const resolved = data.data?.resolved
      if (!resolved || !data.channel_id) return
      const userId = resolved.user_id
      return host.event('interaction/button', {
        button: { id: resolved.button_id ?? '', data: resolved.button_data } as SatoriEvent['button'],
        user: userId ? guildUser(host, { id: userId }) : undefined,
        channel: { id: data.channel_id, type: Channel.Type.TEXT },
        guild: data.guild_id ? { id: data.guild_id } : undefined,
      })
    }
  }
}

function decodeGroupMessage(host: DecodeHost, data: UserMessage, atBot: boolean): SatoriEvent | undefined {
  const groupId = data.group_openid ?? data.group_id
  if (!groupId) return
  const at = parseTime(data.timestamp)
  // The platform may push the same message twice
  if (!host.passive.remember({ id: data.id, kind: 'message', scope: 'group', channelId: groupId, at })) return
  rememberRef(host, data)
  learnSelf(host, data.mentions)

  const elements = decodeContent(host, data)
  // GROUP_AT_MESSAGE_CREATE strips the mention of the bot from content; put it back where it was
  if (atBot && !(elements[0]?.type === 'at' && elements[0].attrs.id === host.selfId)) {
    elements.unshift(h.at(host.selfId))
  }
  const quote = decodeQuote(host, data)
  if (quote) elements.unshift(quote)

  const userId = data.author.member_openid ?? data.author.id
  const user = decodeUser(host, userId, data.author.username, data.author.bot)
  return host.event('message-created', {
    message: { id: data.id, content: elements.join(''), created_at: at },
    user,
    member: {
      user,
      nick: user.name,
      roles: data.author.member_role ? [{ id: data.author.member_role, name: data.author.member_role }] : undefined,
    },
    channel: { id: groupId, type: Channel.Type.TEXT },
    guild: { id: groupId },
  })
}

function decodePrivateMessage(host: DecodeHost, data: UserMessage): SatoriEvent | undefined {
  const userId = data.author.user_openid ?? data.author.id
  const channelId = privateChannel(userId)
  const at = parseTime(data.timestamp)
  if (!host.passive.remember({ id: data.id, kind: 'message', scope: 'c2c', channelId, at })) return
  rememberRef(host, data)

  const elements = decodeContent(host, data)
  const quote = decodeQuote(host, data)
  if (quote) elements.unshift(quote)
  return host.event('message-created', {
    message: { id: data.id, content: elements.join(''), created_at: at },
    user: decodeUser(host, userId, data.author.username, data.author.bot),
    channel: { id: channelId, type: Channel.Type.DIRECT },
  })
}

function decodeGroupMember(host: DecodeHost, payload: GatewayPayload): SatoriEvent {
  const data: GroupMemberEvent = payload.d
  const type = payload.t === 'GROUP_MEMBER_ADD' ? 'guild-member-added'
    : payload.t === 'GROUP_MEMBER_UPDATE' ? 'guild-member-updated' : 'guild-member-removed'
  const user = decodeUser(host, data.user?.id ?? data.member_openid, data.user?.username ?? data.member?.nick, data.user?.bot)
  return host.event(type, {
    guild: { id: data.group_openid },
    channel: { id: data.group_openid, type: Channel.Type.TEXT },
    user,
    member: {
      user,
      nick: data.member?.nick ?? user.name,
      roles: data.member?.roles?.map(id => ({ id })) ?? [],
      joined_at: data.member?.joined_at ? parseTime(data.member.joined_at) : (data.timestamp ? data.timestamp * 1000 : undefined),
    },
    operator: data.op_member_openid ? { id: data.op_member_openid } : undefined,
  })
}

function decodeJoinRequest(host: DecodeHost, data: JoinRequest): SatoriEvent | undefined {
  if (!data.group_openid) return
  host.registerJoinRequest?.(data.join_request_id, data.group_openid, data.member_openid)
  const verify = data.verify_info
  const content = verify?.verify_message
    ?? verify?.review_qa_list?.map(qa => `${qa.question}: ${qa.answer}`).join('\n')
    ?? ''
  return host.event('guild-member-request', {
    // The request id answers it: handleGuildMemberRequest(messageId, ...)
    message: { id: data.join_request_id, content },
    user: decodeUser(host, data.member_openid, data.username, data.bot),
    guild: { id: data.group_openid },
    channel: { id: data.group_openid, type: Channel.Type.TEXT },
    operator: data.op_member_openid ? { id: data.op_member_openid } : undefined,
    timestamp: data.timestamp ? data.timestamp * 1000 : (data.apply_at ? parseTime(data.apply_at) : Date.now()),
  })
}

function decodeInteraction(host: DecodeHost, payload: GatewayPayload): SatoriEvent | undefined {
  const data: Interaction = payload.d
  const resolved = data.data?.resolved
  // Interactions other than buttons and menus carry no button to report
  if (!resolved) return
  const userId = data.group_member_openid ?? data.user_openid ?? resolved.user_id
  const group = data.chat_type === ChatType.Group ? data.group_openid : undefined
  const channelId = group ?? (data.chat_type === ChatType.Direct && userId ? privateChannel(userId) : undefined)
  if (!channelId) return
  if (payload.id) {
    host.passive.remember({
      id: payload.id,
      kind: 'event',
      scope: group ? 'group' : 'c2c',
      channelId,
      at: data.timestamp ? parseTime(data.timestamp) : Date.now(),
    })
  }
  return host.event('interaction/button', {
    button: { id: resolved.button_id ?? '', data: resolved.button_data } as SatoriEvent['button'],
    user: userId ? decodeUser(host, userId) : undefined,
    channel: { id: channelId, type: group ? Channel.Type.TEXT : Channel.Type.DIRECT },
    guild: group ? { id: group } : undefined,
  })
}

// Channels of a guild DM: guild `<source guild>_<dm guild>`, channel `<dm guild>_<dm channel>` (as Koishi does)
function guildPlace(data: Partial<GuildMessage>) {
  return data.direct_message
    ? {
      guild: { id: `${data.src_guild_id}_${data.guild_id}` },
      channel: { id: `${data.guild_id}_${data.channel_id}`, type: Channel.Type.DIRECT },
    }
    : {
      guild: { id: data.guild_id! },
      channel: { id: data.channel_id!, type: Channel.Type.TEXT },
    }
}

function decodeGuildMessage(host: GuildDecodeHost, data: GuildMessage): SatoriEvent | undefined {
  const place = guildPlace(data)
  const at = parseTime(data.timestamp)
  if (!host.passive.remember({ id: data.id, kind: 'message', scope: 'guild', channelId: place.channel.id, at })) return
  const elements: h[] = []
  if (data.message_reference?.message_id) elements.push(h('quote', { id: data.message_reference.message_id }))
  const content = data.content ?? ''
  let last = 0
  for (const match of content.matchAll(/<@!?(\w+)>|<emoji:(\d+)>/g)) {
    if (match.index > last) elements.push(h.text(content.slice(last, match.index)))
    last = match.index + match[0].length
    if (match[2]) elements.push(h('face', { id: match[2] }))
    else elements.push(h.at(match[1] === host.guildUserId ? host.selfId : match[1]))
  }
  if (last < content.length) elements.push(h.text(content.slice(last)))
  for (const attachment of data.attachments ?? []) elements.push(decodeAttachment(attachment))
  const user = guildUser(host, data.author)
  return host.event('message-created', {
    message: { id: data.id, content: elements.join(''), created_at: at },
    user,
    member: data.member ? { user, nick: data.member.nick, roles: data.member.roles?.map(id => ({ id })) } : undefined,
    ...place,
  })
}

function decodeDeletion(host: GuildDecodeHost, data: MessageDeletion): SatoriEvent | undefined {
  const message = data.message
  if (!message?.id) return
  return host.event('message-deleted', {
    message: { id: message.id },
    user: message.author ? guildUser(host, message.author) : undefined,
    operator: data.op_user ? { id: data.op_user.id } : undefined,
    ...guildPlace(message),
  })
}

export function decodeGuild(guild: Guild) {
  return { id: guild.id, name: guild.name, avatar: guild.icon }
}

export function decodeChannel(channel: GuildChannel) {
  const type = channel.type === ChannelType.Voice ? Channel.Type.VOICE
    : channel.type === ChannelType.Group ? Channel.Type.CATEGORY : Channel.Type.TEXT
  return { id: channel.id, name: channel.name, type, parent_id: channel.parent_id, position: channel.position }
}

export function decodeGuildMember(host: { names?: UserNames }, member: GuildMember) {
  const user = member.user ? guildUser(host, member.user) : undefined
  return {
    user,
    nick: member.nick,
    roles: member.roles?.map(id => ({ id })),
    joined_at: member.joined_at ? parseTime(member.joined_at) : undefined,
  }
}

export function guildUser(host: { names?: UserNames }, user: Partial<User> & { id: string }) {
  if (user.username) host.names?.set('qqguild', user.id, user.username)
  return {
    id: user.id,
    name: user.username ?? host.names?.get('qqguild', user.id),
    avatar: user.avatar,
    is_bot: user.bot,
  }
}

// <@openid> and <@all> as documented for GROUP_MESSAGE_CREATE; the qqbot-at forms are what sending uses now. A QQ face
// comes as <faceType=1,faceId="13",ext="<base64 of {"text":"[呲牙]"}>">, which the platform documents nowhere
const MENTION = /<@!?([^>\s]+)>|<qqbot-at-user\s+id="([^"]+)"\s*\/>|<qqbot-at-everyone\s*\/>|<faceType=\d+,faceId="(\d+)"(?:,ext="([^"]*)")?>/g

function decodeContent(host: DecodeHost, data: UserMessage): h[] {
  const elements: h[] = []
  const mentions = data.mentions ?? []
  for (const mention of mentions) {
    const id = mention.member_openid ?? mention.user_openid ?? mention.id
    if (id && mention.username && !mention.is_you) host.names?.set('qq', id, mention.username)
  }
  const content = data.content ?? ''
  let last = 0
  for (const match of content.matchAll(MENTION)) {
    if (match.index > last) elements.push(h.text(content.slice(last, match.index)))
    last = match.index + match[0].length
    if (match[3]) {
      elements.push(decodeFace(match[3], match[4]))
      continue
    }
    const id = match[1] ?? match[2]
    if (!id || id === 'all') {
      elements.push(h('at', { type: 'all' }))
      continue
    }
    const mention = mentions.find(item => item.member_openid === id || item.user_openid === id || item.id === id)
    if (id === host.botOpenid || mention?.is_you) {
      elements.push(h.at(host.selfId))
    } else if (mention || match[2]) {
      elements.push(h.at(id, mention?.username ? { name: mention.username } : {}))
    } else {
      // Not a mention the platform vouches for: keep what the user typed
      elements.push(h.text(match[0]))
    }
  }
  if (last < content.length) elements.push(h.text(content.slice(last)))
  // A message that is only an attachment arrives with a lone space
  while (elements.length && elements[0].type === 'text' && !elements[0].attrs.content.trim()) elements.shift()
  for (const attachment of data.attachments ?? []) elements.push(decodeAttachment(attachment))
  return elements
}

/** The face's name is in `ext`, base64 of `{"text":"[呲牙]"}`; the brackets may be missing. */
function decodeFace(id: string, ext?: string): h {
  let name = ''
  try {
    const text = ext ? JSON.parse(Buffer.from(ext, 'base64').toString('utf8'))?.text : undefined
    if (typeof text === 'string') name = text.replace(/^\[(.*)\]$/, '$1').replace(/^\//, '')
  } catch {}
  return h('face', name ? { id, name } : { id })
}

function decodeAttachment(attachment: Attachment): h {
  const url = absoluteUrl(attachment.url)
  const type = attachment.content_type ?? ''
  if (type.startsWith('image')) {
    return h.image(url, { width: attachment.width, height: attachment.height })
  }
  if (type === 'voice' || type.startsWith('audio')) {
    // The voice itself is silk; the platform also offers it converted to wav
    return h.audio(attachment.voice_wav_url ? absoluteUrl(attachment.voice_wav_url) : url)
  }
  if (type.startsWith('video')) return h.video(url)
  return h.file(url, { title: attachment.filename })
}

// message_type 103: msg_elements holds the quoted message, rendered as text by the platform
function decodeQuote(host: DecodeHost, data: UserMessage): h | undefined {
  const ref = sceneValue(data, 'ref_msg_idx')
  if (!ref && data.message_type !== 103) return
  const quoted = data.msg_elements?.[0]
  const id = (ref && host.passive.messageIdOf(ref)) || ref || quoted?.msg_idx || ''
  return h('quote', { id }, quoted ? decodeQuotedElement(quoted) : [])
}

function decodeQuotedElement(element: MessageElement): h[] {
  const children: h[] = []
  if (element.content) children.push(h.text(quotedText(element.content)))
  for (const attachment of element.attachments ?? []) children.push(decodeAttachment(attachment))
  return children
}

// The platform renders a quoted message like "=== 消息 1 ===\n[消息内容] text\n[消息类型] ..."
function quotedText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(line => /^\s*\[消息内容\]/.test(line))
  if (start < 0) return text
  const body = [lines[start].replace(/^\s*\[消息内容\]\s*/, '')]
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(?:\[消息类型\]|\[关联消息\]|---\s*第\d+条\s*---|===\s*消息\b)/.test(line)) break
    body.push(line)
  }
  return body.join('\n').trimEnd()
}

function rememberRef(host: DecodeHost, data: UserMessage) {
  const ref = sceneValue(data, 'msg_idx')
  if (ref) host.passive.rememberRef(data.id, ref)
}

function rememberEvent(host: DecodeHost, payload: GatewayPayload, scope: 'group' | 'c2c', channelId: string, timestamp?: number) {
  if (!payload.id) return
  host.passive.remember({ id: payload.id, kind: 'event', scope, channelId, at: timestamp ? timestamp * 1000 : Date.now() })
}

function learnSelf(host: DecodeHost, mentions: Mention[] | undefined) {
  const self = mentions?.find(mention => mention.is_you)
  const id = self?.member_openid ?? self?.id
  if (id) host.botOpenid = id
}

function sceneValue(data: UserMessage, key: string): string | undefined {
  for (const item of data.message_scene?.ext ?? []) {
    if (item.startsWith(key + '=')) return item.slice(key.length + 1)
  }
}

function decodeUser(host: DecodeHost, id: string, name?: string, isBot?: boolean) {
  if (name) host.names?.set('qq', id, name)
  return {
    id,
    name: name ?? host.names?.get('qq', id),
    avatar: `https://q.qlogo.cn/qqapp/${host.selfId}/${id}/640`,
    is_bot: isBot,
  }
}

function absoluteUrl(url: string): string {
  if (url.startsWith('//')) return 'https:' + url
  return /^[a-z][a-z\d+.-]*:/i.test(url) ? url : 'https://' + url
}

function parseTime(timestamp: string): number {
  const time = Date.parse(timestamp)
  return Number.isNaN(time) ? Date.now() : time
}
