import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import type { NormalizeHost } from '../../../../../universal/types'
import { decodeGuildChannelId, decodeMessage, encodeMessageId } from '../utils'
import { omit } from 'cosmokit'

export async function parseMessageCreated(
  bot: NormalizeHost,
  data: NT.MessageCreatedEvent
) {
  const message = await decodeMessage(bot.ctx, data.message)
  if (!message) return

  return bot.event('message-created', {
    message: omit(message, ['member', 'user', 'channel', 'guild']),
    member: message.member,
    user: message.user,
    channel: message.channel,
    guild: message.guild
  })
}

export async function parseMessageDeleted(
  bot: NormalizeHost,
  data: NT.MessageDeletedEvent
) {
  const [guildId, channelId] = decodeGuildChannelId({
    chatType: data.chatType,
    peerUid: data.peerUid,
    peerUin: data.peerUin
  })

  return bot.event('message-deleted', {
    message: {
      id: encodeMessageId(data.chatType, data.peerUid, data.msgSeq)
    },
    member: guildId ? {
      user: {
        id: data.senderUin.toString()
      }
    } : undefined,
    user: {
      id: data.senderUin.toString()
    },
    channel: {
      id: channelId,
      type: guildId ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT
    },
    guild: guildId ? {
      id: guildId
    } : undefined,
    operator: {
      id: data.operatorUin.toString()
    }
  })
}
