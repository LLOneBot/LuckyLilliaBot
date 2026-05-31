import SatoriAdapter from '../adapter'
import * as NT from '@/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import { decodeGuild, decodeUser } from '../utils'

interface RawGroupReaction {
  groupCode: string
  msgSeq: number
  operatorUid: string
  code: string
  isAdd: boolean
  count: number
}

async function buildReactionEvent(
  bot: SatoriAdapter,
  input: RawGroupReaction,
  type: 'reaction-added' | 'reaction-removed'
) {
  const peer: NT.Peer = {
    chatType: NT.ChatType.Group,
    peerUid: input.groupCode,
    guildId: ''
  }
  // 优先吃 store cache（自己刚发 / 收到 push 时已经入过），fallback 走 server 拉取
  let raw = bot.ctx.store.getMsgBySeq(input.groupCode, input.msgSeq)
  if (!raw) {
    const { msgList } = await bot.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, input.msgSeq, 1, true)
    raw = msgList[0]
  }
  if (!raw) {
    bot.ctx.logger.error('解析群表情回应失败：未找到消息')
    return
  }

  const user = await bot.ctx.ntUserApi.getUserByUid(input.operatorUid)
  const group = await bot.ctx.ntGroupApi.getGroup(+input.groupCode, false)

  return bot.event(type, {
    message: {
      id: raw.msgId
    },
    user: decodeUser(user),
    channel: {
      id: group.groupCode.toString(),
      name: group.groupName,
      type: Universal.Channel.Type.TEXT
    },
    guild: decodeGuild(group),
    emoji: {
      id: input.code
    }
  })
}

export async function parseReactionAdded(bot: SatoriAdapter, input: RawGroupReaction) {
  return buildReactionEvent(bot, input, 'reaction-added')
}

export async function parseReactionRemoved(bot: SatoriAdapter, input: RawGroupReaction) {
  return buildReactionEvent(bot, input, 'reaction-removed')
}
