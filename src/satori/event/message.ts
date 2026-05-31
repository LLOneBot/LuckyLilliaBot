import SatoriAdapter from '../adapter'
import { MessageDeleteEvent, RawMessage } from '@/ntqqapi/types'
import { decodeMessage, decodeUser } from '../utils'
import { omit } from 'cosmokit'

export async function parseMessageCreated(bot: SatoriAdapter, input: RawMessage) {
  const message = await decodeMessage(bot.ctx, input)
  if (!message) return

  return bot.event('message-created', {
    message: omit(message, ['member', 'user', 'channel', 'guild']),
    member: message.member,
    user: message.user,
    channel: message.channel,
    guild: message.guild
  })
}

export async function parseMessageDeleted(bot: SatoriAdapter, input: MessageDeleteEvent) {
  // 群撤回 push 里 dispatcher 合成的 msgId 与 store 真 msgId 对不上；按 (peerUid, msgRandom)
  // 或 (peerUid, msgSeq) 兜底（GroupRecall proto 里 random 偶尔为 0，必须再退到 seq）
  let origin = bot.ctx.store.getMsgByMsgId(input.msgId)
  if (!origin && input.peerUid) {
    if (typeof input.msgRandom === 'number' && input.msgRandom !== 0) {
      origin = bot.ctx.store.getMsgByRandom(input.peerUid, input.msgRandom)
    }
    if (!origin && typeof input.msgSeq === 'number') {
      origin = bot.ctx.store.getMsgBySeq(input.peerUid, input.msgSeq)
    }
  }
  if (!origin) return
  const message = await decodeMessage(bot.ctx, origin)
  if (!message) return
  let operator
  if (input.operatorUid === input.senderUid) {
    operator = message.user!
  } else {
    operator = decodeUser(await bot.ctx.ntUserApi.getUserByUid(input.operatorUid))
  }

  return bot.event('message-deleted', {
    message: omit(message, ['member', 'user', 'channel', 'guild']),
    member: message.member,
    user: message.user,
    channel: message.channel,
    guild: message.guild,
    operator: omit(operator, ['is_bot'])
  })
}
