import { Context } from 'cordis'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { decodeGuild, decodeGuildMember, decodeMessage, decodeMessageId, decodeUser } from './utils'

// What the logged-in account can do, in the Satori model: NTQQBot's optional capabilities, which the Satori adapter
// serves over its HTTP API as well. A message id carries its chat, so none of them needs the channel.

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

export async function createReaction(ctx: Context, messageId: string, emoji: string) {
  const info = decodeMessageId(messageId)
  if (info.chatType !== NT.ChatType.Group) throw new Error('暂不支持私聊消息回应')
  const result = await ctx.ntMsgApi.setGroupMsgReaction(+info.peerUid, info.msgSeq, emoji, true)
  if (result.errorCode !== 0) throw new Error(result.errorMsg)
}
