import SatoriAdapter from '../adapter'
import * as NT from '@/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import { InferProtoModel } from '@saltify/typeproto'
import { Msg } from '@/ntqqapi/proto'
import { decodeGuild, decodeUser } from '../utils'

export async function parseReactionAdded(
  bot: SatoriAdapter,
  input: InferProtoModel<typeof Msg.NotifyMessageBody>
) {
  const { info, target } = input.reaction.data.body

  const peer: NT.Peer = {
    chatType: NT.ChatType.Group,
    peerUid: input.groupCode.toString(),
    guildId: ''
  }
  const targetMsg = await bot.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, target.sequence.toString(), 1, true, true)
  if (targetMsg.msgList.length === 0) {
    bot.ctx.logger.error('解析群表情回应失败：未找到消息')
    return
  }

  const user = await bot.ctx.ntUserApi.getUserByUid(info.operatorUid)
  const group = await bot.ctx.ntGroupApi.getGroup(input.groupCode, false)

  return bot.event('reaction-added', {
    message: {
      id: targetMsg.msgList[0].msgId
    },
    user: decodeUser(user),
    channel: {
      id: group.groupCode.toString(),
      name: group.groupName,
      type: Universal.Channel.Type.TEXT
    },
    guild: decodeGuild(group),
    emoji: {
      id: info.code
    }
  })
}

export async function parseReactionRemoved(
  bot: SatoriAdapter,
  input: InferProtoModel<typeof Msg.NotifyMessageBody>
) {
  const { info, target } = input.reaction.data.body

  const peer: NT.Peer = {
    chatType: NT.ChatType.Group,
    peerUid: input.groupCode.toString(),
    guildId: ''
  }
  const targetMsg = await bot.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, target.sequence.toString(), 1, true, true)
  if (targetMsg.msgList.length === 0) {
    bot.ctx.logger.error('解析群表情回应失败：未找到消息')
    return
  }

  const user = await bot.ctx.ntUserApi.getUserByUid(info.operatorUid)
  const group = await bot.ctx.ntGroupApi.getGroup(input.groupCode, false)

  return bot.event('reaction-removed', {
    message: {
      id: targetMsg.msgList[0].msgId
    },
    user: decodeUser(user),
    channel: {
      id: group.groupCode.toString(),
      name: group.groupName,
      type: Universal.Channel.Type.TEXT
    },
    guild: decodeGuild(group),
    emoji: {
      id: info.code
    }
  })
}
