import { Channel } from '@satorijs/protocol'
import { Context } from 'cordis'
import type { NeutralList, NeutralResource } from '@luckylillia/plugin-sdk'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { filterNullable } from '@/common/utils/misc'
import {
  decodeGroupRequestFlag, decodeGuild, decodeGuildMember, decodeMessage, decodeMessageId, decodeUser, encodeMessageId, getPeer,
} from './utils'

// What the logged-in account can do, in the Satori model: NTQQBot's optional capabilities, which the Satori adapter
// serves to its clients through the bot. A message id carries its chat, so none of them needs the channel. A group is
// a guild with a single channel of the same id.

export async function getMessage(ctx: Context, messageId: string) {
  const info = decodeMessageId(messageId)
  let msg = ctx.store.getMsgBySeq(info.peerUid, info.msgSeq)
  if (!msg) {
    const { msgList } = await ctx.ntMsgApi.getSingleMsg(info, info.msgSeq)
    msg = msgList[0]
  }
  if (!msg) throw new Error('获取不到消息')
  const result = await decodeMessage(ctx, msg)
  if (!result) throw new Error('消息为空')
  return result
}

export async function deleteMessage(ctx: Context, messageId: string) {
  const info = decodeMessageId(messageId)
  if (info.chatType === NT.ChatType.Group) {
    await ctx.ntMsgApi.recallMsg(info, info.msgSeq)
    return
  }
  let msg = ctx.store.getMsgBySeq(info.peerUid, info.msgSeq)
  if (!msg) {
    const { msgList } = await ctx.ntMsgApi.getSingleMsg(info, info.msgSeq)
    msg = msgList[0]
  }
  await ctx.ntMsgApi.recallMsg(info, msg.msgSeq, msg.clientSeq, msg.msgRandom, msg.msgTime)
}

export async function getUser(ctx: Context, userId: string) {
  return decodeUser(await ctx.ntUserApi.getUserByUin(+userId))
}

export async function getGuild(ctx: Context, guildId: string) {
  return decodeGuild(await ctx.ntGroupApi.getGroup(+guildId, true))
}

async function memberUid(ctx: Context, guildId: string, userId: string) {
  const uid = await ctx.ntUserApi.getUidByUin(+userId, +guildId)
  if (!uid) throw new Error('无法获取用户信息')
  return uid
}

export async function getGuildMember(ctx: Context, guildId: string, userId: string) {
  const member = await ctx.ntGroupApi.getGroupMemberByUid(+guildId, await memberUid(ctx, guildId, userId), true)
  if (!member) throw new Error('群组成员未找到')
  return decodeGuildMember(member)
}

/** `duration` in milliseconds. */
export async function muteGuildMember(ctx: Context, guildId: string, userId: string, duration: number) {
  const uid = await memberUid(ctx, guildId, userId)
  const result = await ctx.ntGroupApi.muteGroupMember(+guildId, [{ uid, duration: duration / 1000 }])
  if (result.errorCode !== 0) throw new Error(result.errorMsg)
}

export async function kickGuildMember(ctx: Context, guildId: string, userId: string, permanent = false) {
  const result = await ctx.ntGroupApi.kickGroupMember(+guildId, [await memberUid(ctx, guildId, userId)], permanent)
  if (result.errorCode !== 0) throw new Error(result.errorMsg)
}

function groupReaction(messageId: string) {
  const info = decodeMessageId(messageId)
  if (info.chatType !== NT.ChatType.Group) throw new Error('暂不支持私聊消息回应')
  return info
}

function check(result: { errorCode: number; errorMsg: string }) {
  if (result.errorCode !== 0) throw new Error(result.errorMsg)
}

export async function createReaction(ctx: Context, messageId: string, emoji: string) {
  const info = groupReaction(messageId)
  check(await ctx.ntMsgApi.setGroupMsgReaction(+info.peerUid, info.msgSeq, emoji, true))
}

export async function deleteReaction(ctx: Context, messageId: string, emoji: string) {
  const info = groupReaction(messageId)
  check(await ctx.ntMsgApi.setGroupMsgReaction(+info.peerUid, info.msgSeq, emoji, false))
}

export async function getReactionList(ctx: Context, messageId: string, emoji: string, next?: string): Promise<NeutralList> {
  const info = groupReaction(messageId)
  const data = await ctx.ntMsgApi.getMsgReactionList(info, info.msgSeq, emoji, 15, next ?? '')
  const users = await Promise.all(data.users.map(user => ctx.ntUserApi.getUserByUin(user.uin)))
  return { data: users.map(user => decodeUser(user)), next: data.cookie || undefined }
}

export async function getMessageList(
  ctx: Context,
  channelId: string,
  next?: string,
  limit = 50,
  order?: 'asc' | 'desc',
): Promise<NeutralList> {
  const peer = await getPeer(ctx, channelId)
  // `next` is the id of the last message of the page before
  const seq = next ? decodeMessageId(next).msgSeq : await ctx.ntMsgApi.getLatestMsgSeq(peer)
  const { msgList } = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, seq, limit, true)
  const data = filterNullable(await Promise.all(msgList.map(msg => decodeMessage(ctx, msg))))
  if (order === 'desc') data.reverse()
  const last = msgList.at(-1)
  return { data, next: last ? encodeMessageId(last.chatType, last.peerUid, last.msgSeq) : undefined }
}

export async function getGuildList(ctx: Context): Promise<NeutralList> {
  return { data: (await ctx.ntGroupApi.getGroups(true)).map(decodeGuild) }
}

export async function getChannel(ctx: Context, channelId: string): Promise<NeutralResource> {
  if (channelId.startsWith('private:')) return { id: channelId, type: Channel.Type.DIRECT }
  const info = await ctx.ntGroupApi.getGroup(+channelId, true)
  return { id: channelId, type: Channel.Type.TEXT, name: info.groupName }
}

export async function updateChannel(ctx: Context, channelId: string, data: { name?: string }) {
  if (data?.name) check(await ctx.ntGroupApi.setGroupName(+channelId, data.name))
}

/** Leaves the group. */
export async function deleteChannel(ctx: Context, channelId: string) {
  check(await ctx.ntGroupApi.quitGroup(+channelId))
}

/** Mutes the whole group, or lifts it. */
export async function muteChannel(ctx: Context, channelId: string, enable = true) {
  check(await ctx.ntGroupApi.muteGroup(+channelId, enable))
}

export async function getGuildMemberList(ctx: Context, guildId: string): Promise<NeutralList> {
  return { data: (await ctx.ntGroupApi.getGroupMembers(+guildId, true)).map(decodeGuildMember) }
}

/** Answers a join request (`guild-member-request`) or an invitation into a group (`guild-request`). */
export async function handleGroupRequest(ctx: Context, messageId: string, approve: boolean, comment?: string) {
  const info = decodeGroupRequestFlag(messageId)
  check(await ctx.ntGroupApi.setGroupRequest(info.doubt, info.groupCode, info.seq, info.type, approve, comment))
}

// The ids members carry (decodeGuildMember): NT.GroupMemberRole
const ROLES = [
  { id: String(NT.GroupMemberRole.Owner), name: 'owner' },
  { id: String(NT.GroupMemberRole.Admin), name: 'admin' },
  { id: String(NT.GroupMemberRole.Normal), name: 'member' },
]

export function getGuildRoleList(): NeutralList {
  return { data: ROLES }
}

/** A group only has admin to give: setting member, or unsetting admin, takes it away. */
export async function setGuildMemberRole(ctx: Context, guildId: string, userId: string, roleId: string, set = true) {
  const admin = String(NT.GroupMemberRole.Admin)
  let makeAdmin: boolean
  if (roleId === admin) makeAdmin = set
  else if (roleId === String(NT.GroupMemberRole.Normal) && set) makeAdmin = false
  else throw new Error(`群里只能设置或取消管理员（角色 ${admin}）`)
  check(await ctx.ntGroupApi.setGroupMemberAdmin(+guildId, await memberUid(ctx, guildId, userId), makeAdmin))
}

export async function getFriendList(ctx: Context): Promise<NeutralList> {
  const { friends } = await ctx.ntFriendApi.getFriends(true)
  return { data: friends.map(friend => ({ user: decodeUser(friend), nick: friend.remark })) }
}

export async function handleFriendRequest(ctx: Context, messageId: string, approve: boolean) {
  await ctx.ntFriendApi.approvalFriendRequest(messageId, approve)
}

export async function deleteFriend(ctx: Context, userId: string) {
  const uid = await ctx.ntUserApi.getUidByUin(+userId)
  if (!uid) throw new Error('无法获取用户信息')
  check(await ctx.ntFriendApi.deleteFriend(uid))
}
